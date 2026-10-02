import { Injectable, Logger } from '@nestjs/common';
import { prisma, Prisma, BookingStatus, ReviewModerationStatus } from '@project-nirvana/db';
import { ProviderReliabilityMetrics } from '@project-nirvana/shared';

@Injectable()
export class RatingAggregationService {
  private readonly logger = new Logger(RatingAggregationService.name);

  // Bayesian prior parameters:
  // m = minimum confidence review count threshold
  // C = prior mean rating (assumed baseline for verified practitioners)
  private readonly PRIOR_WEIGHT_M = 5;
  private readonly PRIOR_MEAN_C = 4.5;

  /**
   * Recalculates average rating and Bayesian ranking score transactionally
   */
  async recalculateProviderRating(
    providerId: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<{ ratingAvg: number; ratingCount: number; bayesianRating: number }> {
    const db = txClient || prisma;

    // Fetch all published reviews for provider
    const reviews = await db.review.findMany({
      where: {
        providerId,
        isPublished: true,
        moderationStatus: {
          in: [ReviewModerationStatus.PUBLISHED, ReviewModerationStatus.FLAGGED],
        },
      },
      select: { rating: true },
    });

    const ratingCount = reviews.length;
    let ratingAvg = 0;
    let bayesianRating = 0;

    if (ratingCount > 0) {
      const sum = reviews.reduce((acc, curr) => acc + curr.rating, 0);
      ratingAvg = Number((sum / ratingCount).toFixed(2));

      // Bayesian formula: (v * R + m * C) / (v + m)
      const numerator = ratingCount * ratingAvg + this.PRIOR_WEIGHT_M * this.PRIOR_MEAN_C;
      const denominator = ratingCount + this.PRIOR_WEIGHT_M;
      bayesianRating = Number((numerator / denominator).toFixed(2));
    } else {
      ratingAvg = 0;
      bayesianRating = 0;
    }

    // Transactionally update the ProviderProfile
    await db.providerProfile.updateMany({
      where: { userId: providerId },
      data: {
        ratingAvg: new Prisma.Decimal(ratingAvg),
        ratingCount,
        bayesianRating: new Prisma.Decimal(bayesianRating),
      },
    });

    this.logger.log(
      `Recalculated provider ratings: providerId=${providerId} ratingAvg=${ratingAvg} ratingCount=${ratingCount} bayesianRating=${bayesianRating}`,
    );

    return { ratingAvg, ratingCount, bayesianRating };
  }

  /**
   * Recalculates provider reliability metrics: completion rate, cancellation rate, response speed, badges
   */
  async recalculateProviderReliability(
    providerId: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<ProviderReliabilityMetrics> {
    const db = txClient || prisma;

    // 1. Fetch provider bookings
    const bookings = await db.booking.findMany({
      where: { providerId },
      select: { status: true },
    });

    const totalBookings = bookings.length;
    const completedBookings = bookings.filter((b) => b.status === BookingStatus.COMPLETED).length;
    const providerCancelled = bookings.filter(
      (b) => b.status === BookingStatus.CANCELLED_BY_PROVIDER,
    ).length;

    let completionRate = 100.0;
    let cancellationRate = 0.0;

    if (totalBookings > 0) {
      // Non-pending bookings count as base for completion rate
      const activeOrFinished = bookings.filter(
        (b) => b.status !== BookingStatus.PENDING_PAYMENT,
      ).length;

      if (activeOrFinished > 0) {
        completionRate = Number(((completedBookings / activeOrFinished) * 100).toFixed(2));
        cancellationRate = Number(((providerCancelled / activeOrFinished) * 100).toFixed(2));
      }
    }

    // 2. Compute average response time in minutes from conversation messages
    let avgResponseMinutes = 30; // default baseline
    try {
      const convs = await db.conversation.findMany({
        where: { providerId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 10,
          },
        },
        take: 20,
      });

      const responseDeltas: number[] = [];
      for (const c of convs) {
        const msgs = c.messages;
        for (let i = 0; i < msgs.length - 1; i++) {
          if (msgs[i].senderId !== providerId && msgs[i + 1].senderId === providerId) {
            const diffMinutes = Math.max(
              1,
              Math.round(
                (msgs[i + 1].createdAt.getTime() - msgs[i].createdAt.getTime()) / (1000 * 60),
              ),
            );
            if (diffMinutes < 24 * 60) {
              responseDeltas.push(diffMinutes);
            }
          }
        }
      }

      if (responseDeltas.length > 0) {
        const avg = responseDeltas.reduce((a, b) => a + b, 0) / responseDeltas.length;
        avgResponseMinutes = Math.max(5, Math.round(avg));
      }
    } catch {
      avgResponseMinutes = 30;
    }

    // 3. Generate Reliability Badges
    const badges: string[] = [];

    let responseBadge = 'Responds quickly';
    if (avgResponseMinutes <= 60) {
      responseBadge = 'Responds within 1 hour';
      badges.push('Responds within 1 hour');
    } else if (avgResponseMinutes <= 120) {
      responseBadge = 'Responds within 2 hours';
      badges.push('Responds within 2 hours');
    } else {
      responseBadge = 'Responds within 24 hours';
      badges.push('Responds within 24 hours');
    }

    if (completionRate >= 98 && completedBookings >= 3) {
      badges.push('99% Session Completion');
    }

    if (cancellationRate === 0 && completedBookings >= 3) {
      badges.push('Zero Cancellations');
    }

    if (completedBookings >= 10) {
      badges.push('Experienced Guide');
    }

    // Update ProviderProfile
    await db.providerProfile.updateMany({
      where: { userId: providerId },
      data: {
        completionRate: new Prisma.Decimal(completionRate),
        cancellationRate: new Prisma.Decimal(cancellationRate),
        avgResponseMinutes,
        completedSessions: completedBookings,
        reliabilityBadges: badges,
      },
    });

    const profile = await db.providerProfile.findFirst({
      where: { userId: providerId },
      select: {
        ratingAvg: true,
        ratingCount: true,
        bayesianRating: true,
      },
    });

    return {
      completionRate,
      cancellationRate,
      avgResponseMinutes,
      responseBadge,
      reliabilityBadges: badges,
      bayesianRating: Number(profile?.bayesianRating ?? 0),
      ratingAvg: Number(profile?.ratingAvg ?? 0),
      totalReviews: profile?.ratingCount ?? 0,
      completedSessions: completedBookings,
    };
  }

  /**
   * Fetches provider reliability metrics and badges
   */
  async getProviderMetrics(providerId: string): Promise<ProviderReliabilityMetrics> {
    const profile = await prisma.providerProfile.findFirst({
      where: { userId: providerId },
    });

    if (!profile) {
      return {
        completionRate: 100,
        cancellationRate: 0,
        avgResponseMinutes: 30,
        responseBadge: 'Responds within 1 hour',
        reliabilityBadges: ['Responds within 1 hour'],
        bayesianRating: 0,
        ratingAvg: 0,
        totalReviews: 0,
        completedSessions: 0,
      };
    }

    let responseBadge = 'Responds within 1 hour';
    if (profile.avgResponseMinutes <= 60) {
      responseBadge = 'Responds within 1 hour';
    } else if (profile.avgResponseMinutes <= 120) {
      responseBadge = 'Responds within 2 hours';
    } else {
      responseBadge = 'Responds within 24 hours';
    }

    return {
      completionRate: Number(profile.completionRate),
      cancellationRate: Number(profile.cancellationRate),
      avgResponseMinutes: profile.avgResponseMinutes,
      responseBadge,
      reliabilityBadges: profile.reliabilityBadges,
      bayesianRating: Number(profile.bayesianRating),
      ratingAvg: Number(profile.ratingAvg),
      totalReviews: profile.ratingCount,
      completedSessions: profile.completedSessions,
    };
  }
}

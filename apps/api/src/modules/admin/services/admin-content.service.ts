import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  prisma,
  ReviewModerationStatus,
  ReportStatus,
  UserStatus,
  ApprovalStatus,
} from '@project-nirvana/db';
import {
  AdminCategoryUpsert,
  AdminFeaturedProvider,
  AdminReviewModerationAction,
  AdminReportAction,
} from '@project-nirvana/shared';
import { AuditService } from '../../audit/audit.service';
import { RatingAggregationService } from '../../reviews/services/rating-aggregation.service';
import { AuthenticatedUser } from '../../auth/policies/policy.service';

@Injectable()
export class AdminContentService {
  constructor(
    private readonly auditService: AuditService,
    private readonly ratingAggregationService: RatingAggregationService,
  ) {}

  // 1. Categories
  async listCategories() {
    return prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { providers: true, services: true },
        },
        subcategories: true,
      },
    });
  }

  async upsertCategory(
    adminUser: AuthenticatedUser,
    dto: AdminCategoryUpsert,
    categoryId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    let beforeState = null;
    if (categoryId) {
      const existing = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!existing) throw new NotFoundException(`Category ${categoryId} not found`);
      beforeState = existing;
    }

    const category = categoryId
      ? await prisma.category.update({
          where: { id: categoryId },
          data: {
            name: dto.name,
            slug: dto.slug,
            description: dto.description,
            icon: dto.icon,
            requiresLicense: dto.requiresLicense,
            commissionBps: dto.commissionBps,
            isActive: dto.isActive,
          },
        })
      : await prisma.category.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            description: dto.description,
            icon: dto.icon,
            requiresLicense: dto.requiresLicense,
            commissionBps: dto.commissionBps,
            isActive: dto.isActive,
          },
        });

    await this.auditService.record({
      userId: adminUser.id,
      action: categoryId ? 'ADMIN_CATEGORY_UPDATED' : 'ADMIN_CATEGORY_CREATED',
      entityType: 'Category',
      entityId: category.id,
      reason: `Category ${category.name} configuration updated`,
      beforeState: beforeState as any,
      afterState: category as any,
      ipAddress,
      userAgent,
    });

    return category;
  }

  // 2. Featured Providers
  async listFeaturedProviders() {
    return prisma.providerProfile.findMany({
      where: { isFeatured: true },
      select: {
        id: true,
        displayName: true,
        slug: true,
        avatarUrl: true,
        headline: true,
        ratingAvg: true,
        ratingCount: true,
        bayesianRating: true,
        verificationTier: true,
        approvalStatus: true,
      },
    });
  }

  async toggleFeaturedProvider(
    adminUser: AuthenticatedUser,
    dto: AdminFeaturedProvider,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const profile = await prisma.providerProfile.findUnique({
      where: { id: dto.providerId },
    });

    if (!profile) {
      throw new NotFoundException(`Provider profile ${dto.providerId} not found`);
    }

    const beforeState = { isFeatured: profile.isFeatured };

    const updated = await prisma.providerProfile.update({
      where: { id: dto.providerId },
      data: { isFeatured: dto.isFeatured },
    });

    const afterState = { isFeatured: updated.isFeatured };

    await this.auditService.record({
      userId: adminUser.id,
      action: dto.isFeatured ? 'ADMIN_PROVIDER_FEATURED' : 'ADMIN_PROVIDER_UNFEATURED',
      entityType: 'ProviderProfile',
      entityId: dto.providerId,
      reason: dto.reason,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
      metadata: { displayName: profile.displayName },
    });

    return {
      success: true,
      message: `${profile.displayName} is ${dto.isFeatured ? 'now featured' : 'no longer featured'}.`,
    };
  }

  // 3. Review Moderation
  async listReviewsForModeration(status?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) {
      where.moderationStatus = status as ReviewModerationStatus;
    }

    const [total, reviews] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          consumer: { select: { id: true, email: true } },
          provider: { select: { id: true, email: true } },
          booking: {
            select: {
              id: true,
              provider: {
                select: {
                  id: true,
                  email: true,
                  providerProfile: { select: { displayName: true } },
                },
              },
            },
          },
          reports: true,
        },
      }),
    ]);

    return { reviews, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async moderateReview(
    adminUser: AuthenticatedUser,
    reviewId: string,
    dto: AdminReviewModerationAction,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { booking: true },
    });

    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const beforeState = {
      moderationStatus: review.moderationStatus,
      isPublished: review.isPublished,
    };

    const isPublished = dto.status === 'PUBLISHED';
    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        moderationStatus: dto.status as ReviewModerationStatus,
        isPublished,
      },
    });

    // Recalculate provider profile ratings
    await this.ratingAggregationService.recalculateProviderRating(review.booking.providerId);

    const afterState = {
      moderationStatus: updated.moderationStatus,
      isPublished: updated.isPublished,
    };

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_REVIEW_MODERATED',
      entityType: 'Review',
      entityId: reviewId,
      reason: dto.reason,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
      metadata: { targetStatus: dto.status },
    });

    return {
      success: true,
      message: `Review moderation status updated to ${dto.status}.`,
      review: updated,
    };
  }

  // 4. Reports Moderation
  async listReports(status?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) {
      where.status = status as ReportStatus;
    }

    const [total, reports] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, email: true } },
          reportedUser: {
            select: {
              id: true,
              email: true,
              role: true,
              status: true,
              providerProfile: { select: { displayName: true } },
            },
          },
        },
      }),
    ]);

    return { reports, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async actionReport(
    adminUser: AuthenticatedUser,
    reportId: string,
    dto: AdminReportAction,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reportedUser: { include: { providerProfile: true } },
      },
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    const beforeState = { status: report.status, actionTaken: report.actionTaken };

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: dto.status as ReportStatus,
          actionTaken: dto.actionTaken,
          adminNotes: dto.adminNotes,
        },
      });

      if (dto.suspendUser) {
        await tx.user.update({
          where: { id: report.reportedUserId },
          data: { status: UserStatus.SUSPENDED },
        });

        if (report.reportedUser.providerProfile) {
          await tx.providerProfile.update({
            where: { id: report.reportedUser.providerProfile.id },
            data: { approvalStatus: ApprovalStatus.SUSPENDED },
          });
        }
      }
    });

    const afterState = {
      status: dto.status,
      actionTaken: dto.actionTaken,
      userSuspended: dto.suspendUser,
    };

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_REPORT_ACTIONED',
      entityType: 'Report',
      entityId: reportId,
      reason: dto.actionTaken,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
      metadata: { targetUserId: report.reportedUserId, userSuspended: dto.suspendUser },
    });

    return {
      success: true,
      message: `Report marked as ${dto.status}.`,
    };
  }
}

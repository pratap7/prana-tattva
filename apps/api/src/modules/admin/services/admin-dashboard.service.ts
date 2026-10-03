import { Injectable } from '@nestjs/common';
import {
  prisma,
  BookingStatus,
  DisputeStatus,
  ReportStatus,
  ApprovalStatus,
} from '@project-nirvana/db';
import { AdminDashboardMetrics } from '@project-nirvana/shared';

@Injectable()
export class AdminDashboardService {
  async getMetrics(): Promise<AdminDashboardMetrics> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [
      gmvAggregate,
      revenueAggregate,
      bookingsTodayCount,
      totalBookingsCount,
      newProvidersCount,
      pendingVerificationsCount,
      openDisputesCount,
      openReportsCount,
      activeUsersCount,
      recentBookings,
    ] = await Promise.all([
      // 1. GMV: All confirmed, completed or disputed bookings
      prisma.booking.aggregate({
        _sum: { priceSnapshot: true },
        where: {
          status: {
            in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.DISPUTED],
          },
        },
      }),

      // 2. Commission revenue: ledger entries of PLATFORM_REVENUE type CREDIT
      prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: {
          accountType: 'PLATFORM_REVENUE',
          entryType: 'CREDIT',
        },
      }),

      // 3. Bookings today
      prisma.booking.count({
        where: {
          createdAt: { gte: startOfToday },
        },
      }),

      // 4. Total bookings
      prisma.booking.count(),

      // 5. New providers in last 30 days
      prisma.providerProfile.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      // 6. Pending practitioner verifications
      prisma.providerProfile.count({
        where: {
          approvalStatus: ApprovalStatus.PENDING,
        },
      }),

      // 7. Open disputes
      prisma.dispute.count({
        where: {
          status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
        },
      }),

      // 8. Open reports
      prisma.report.count({
        where: {
          status: { in: [ReportStatus.PENDING, ReportStatus.INVESTIGATING] },
        },
      }),

      // 9. Active users
      prisma.user.count({
        where: {
          status: 'ACTIVE',
        },
      }),

      // 10. Bookings per day in last 14 days
      prisma.booking.findMany({
        where: {
          createdAt: { gte: fourteenDaysAgo },
        },
        select: {
          createdAt: true,
          priceSnapshot: true,
        },
      }),
    ]);

    const gmvPaise = gmvAggregate._sum.priceSnapshot || 0;
    const commissionRevenuePaise = revenueAggregate._sum.amount || 0;
    const takeRateBps =
      gmvPaise > 0 ? Math.round((commissionRevenuePaise / gmvPaise) * 10000) : 1500;

    // Build 14-day timeline breakdown
    const dayMap = new Map<string, { count: number; volumePaise: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { count: 0, volumePaise: 0 });
    }

    for (const b of recentBookings) {
      const key = b.createdAt.toISOString().slice(0, 10);
      const entry = dayMap.get(key);
      if (entry) {
        entry.count += 1;
        entry.volumePaise += b.priceSnapshot;
      }
    }

    const bookingsPerDay = Array.from(dayMap.entries()).map(([date, data]) => ({
      date,
      count: data.count,
      volumePaise: data.volumePaise,
    }));

    return {
      gmvPaise,
      takeRateBps,
      commissionRevenuePaise,
      bookingsToday: bookingsTodayCount,
      totalBookings: totalBookingsCount,
      bookingsPerDay,
      newProvidersCount,
      pendingVerificationsCount,
      openDisputesCount,
      openReportsCount,
      activeUsersCount,
    };
  }
}

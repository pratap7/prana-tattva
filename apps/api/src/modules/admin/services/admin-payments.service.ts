import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  prisma,
  Prisma,
  LedgerAccountType,
  LedgerEntryType,
  PayoutStatus,
} from '@project-nirvana/db';
import { AdminLedgerQuery, AdminPayoutRetry, ReconciliationSummary } from '@project-nirvana/shared';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/policies/policy.service';

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly auditService: AuditService) {}

  async listLedgerEntries(query: AdminLedgerQuery) {
    const { accountType, type, bookingId, page = 1, limit = 20, exportCsv } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LedgerEntryWhereInput = {};

    if (accountType) {
      where.accountType = accountType as LedgerAccountType;
    }

    if (type) {
      where.entryType = type as LedgerEntryType;
    }

    if (bookingId) {
      where.bookingId = bookingId;
    }

    if (exportCsv) {
      const allEntries = await prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const header =
        'EntryID,BookingID,AccountType,EntryType,AmountPaise,Currency,Description,CreatedAt\n';
      const rows = allEntries
        .map((e) => {
          const desc = `"${(e.description || '').replace(/"/g, '""')}"`;
          return `${e.id},${e.bookingId || ''},${e.accountType},${e.entryType},${e.amount},${e.currency},${desc},${e.createdAt.toISOString()}`;
        })
        .join('\n');

      return { csv: header + rows, filename: `ledger-export-${Date.now()}.csv` };
    }

    const [total, entries] = await Promise.all([
      prisma.ledgerEntry.count({ where }),
      prisma.ledgerEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listFailedPayouts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.PayoutWhereInput = {
      status: PayoutStatus.FAILED,
    };

    const [total, payouts] = await Promise.all([
      prisma.payout.count({ where }),
      prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          provider: {
            select: { id: true, displayName: true, slug: true, payoutAccountId: true },
          },
        },
      }),
    ]);

    return { payouts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async retryPayout(
    adminUser: AuthenticatedUser,
    dto: AdminPayoutRetry,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const payout = await prisma.payout.findUnique({
      where: { id: dto.payoutId },
      include: { provider: true },
    });

    if (!payout) {
      throw new NotFoundException(`Payout ${dto.payoutId} not found`);
    }

    if (payout.status !== PayoutStatus.FAILED) {
      throw new BadRequestException(
        `Payout is currently ${payout.status}, only FAILED payouts can be retried.`,
      );
    }

    const beforeState = { status: payout.status };

    const updated = await prisma.payout.update({
      where: { id: dto.payoutId },
      data: {
        status: PayoutStatus.PENDING,
      },
    });

    const afterState = { status: updated.status };

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_PAYOUT_RETRY_INITIATED',
      entityType: 'Payout',
      entityId: dto.payoutId,
      reason: dto.reason,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
      metadata: { amountPaise: payout.amount, providerId: payout.providerId },
    });

    return {
      success: true,
      message: `Payout reset to PENDING for processing retry`,
      payout: updated,
    };
  }

  async getReconciliationReport(): Promise<ReconciliationSummary> {
    const [paymentsAggregate, ledgerAggregates, failedPayoutsAggregate, failedPayoutsCount] =
      await Promise.all([
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'CAPTURED' },
        }),
        prisma.ledgerEntry.groupBy({
          by: ['accountType', 'entryType'],
          _sum: { amount: true },
        }),
        prisma.payout.aggregate({
          _sum: { amount: true },
          where: { status: PayoutStatus.FAILED },
        }),
        prisma.payout.count({
          where: { status: PayoutStatus.FAILED },
        }),
      ]);

    const gatewayCapturedPaise = paymentsAggregate._sum.amount || 0;

    // Calculate balances per ledger account
    // Balance = Credits - Debits
    const accountBalances: Record<string, number> = {};
    for (const group of ledgerAggregates) {
      const acc = group.accountType;
      const sum = group._sum.amount || 0;
      if (!accountBalances[acc]) accountBalances[acc] = 0;
      if (group.entryType === 'CREDIT') {
        accountBalances[acc] += sum;
      } else {
        accountBalances[acc] -= sum;
      }
    }

    const ledgerEscrowBalancePaise = Math.max(0, accountBalances['PLATFORM_ESCROW'] || 0);
    const ledgerRevenueBalancePaise = Math.max(0, accountBalances['PLATFORM_REVENUE'] || 0);
    const ledgerPayableBalancePaise = Math.max(0, accountBalances['PROVIDER_PAYABLE'] || 0);
    const failedPayoutsVolumePaise = failedPayoutsAggregate._sum.amount || 0;

    const discrepancies: string[] = [];

    // Sanity checks
    if (
      gatewayCapturedPaise > 0 &&
      ledgerEscrowBalancePaise + ledgerRevenueBalancePaise + ledgerPayableBalancePaise === 0
    ) {
      discrepancies.push(
        'Captured gateway funds exist without corresponding platform ledger accounts.',
      );
    }

    if (failedPayoutsCount > 0) {
      discrepancies.push(
        `${failedPayoutsCount} failed payouts pending retry totaling ₹${(failedPayoutsVolumePaise / 100).toFixed(2)}.`,
      );
    }

    const isReconciled = discrepancies.length === 0;

    return {
      gatewayCapturedPaise,
      ledgerEscrowBalancePaise,
      ledgerRevenueBalancePaise,
      ledgerPayableBalancePaise,
      failedPayoutsCount,
      failedPayoutsVolumePaise,
      isReconciled,
      discrepancies,
    };
  }
}

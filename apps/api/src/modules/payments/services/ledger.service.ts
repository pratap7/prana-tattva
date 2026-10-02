import { Injectable, Logger } from '@nestjs/common';
import { prisma, LedgerEntryType, LedgerAccountType, PrismaClient } from '@project-nirvana/db';
import { calculateCommissionAndShare, LedgerReconciliationResult } from '@project-nirvana/shared';

type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  /**
   * Records initial customer payment capture in double-entry ledger.
   * Debit: CONSUMER_PAYMENT (Cash asset received)
   * Credit: PLATFORM_ESCROW (Liability: funds held in trust)
   */
  async recordCustomerPayment(
    bookingId: string,
    amountPaise: number,
    currency: string = 'INR',
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    const db = tx || prisma;
    this.logger.log(
      `Ledger: Recording customer payment of ₹${(amountPaise / 100).toFixed(2)} for booking ${bookingId}`,
    );

    // 1. Debit CONSUMER_PAYMENT
    await db.ledgerEntry.create({
      data: {
        bookingId,
        entryType: LedgerEntryType.DEBIT,
        accountType: LedgerAccountType.CONSUMER_PAYMENT,
        amount: amountPaise,
        currency,
        description: `Customer payment received for booking ${bookingId}`,
      },
    });

    // 2. Credit PLATFORM_ESCROW
    await db.ledgerEntry.create({
      data: {
        bookingId,
        entryType: LedgerEntryType.CREDIT,
        accountType: LedgerAccountType.PLATFORM_ESCROW,
        amount: amountPaise,
        currency,
        description: `Funds held in trust in escrow for booking ${bookingId}`,
      },
    });
  }

  /**
   * Releases funds from escrow upon session completion.
   * Splits into platform revenue and provider payable with ZERO-PAISE leakage.
   * Debit: PLATFORM_ESCROW (Amount released)
   * Credit: PLATFORM_REVENUE (Commission share)
   * Credit: PROVIDER_PAYABLE (Provider share)
   */
  async recordEscrowRelease(
    bookingId: string,
    totalAmountPaise: number,
    commissionBps: number,
    currency: string = 'INR',
    tx?: PrismaTransactionClient,
  ): Promise<{ commissionPaise: number; providerSharePaise: number }> {
    const db = tx || prisma;
    const { commissionPaise, providerSharePaise } = calculateCommissionAndShare(
      totalAmountPaise,
      commissionBps,
    );

    this.logger.log(
      `Ledger: Escrow release for booking ${bookingId}: Total: ₹${(totalAmountPaise / 100).toFixed(2)}, ` +
        `Commission: ₹${(commissionPaise / 100).toFixed(2)}, Provider Share: ₹${(providerSharePaise / 100).toFixed(2)}`,
    );

    // 1. Debit PLATFORM_ESCROW (Extinguish escrow liability)
    await db.ledgerEntry.create({
      data: {
        bookingId,
        entryType: LedgerEntryType.DEBIT,
        accountType: LedgerAccountType.PLATFORM_ESCROW,
        amount: totalAmountPaise,
        currency,
        description: `Release of escrow funds for completed session ${bookingId}`,
      },
    });

    // 2. Credit PLATFORM_REVENUE (Platform commission recognized)
    if (commissionPaise > 0) {
      await db.ledgerEntry.create({
        data: {
          bookingId,
          entryType: LedgerEntryType.CREDIT,
          accountType: LedgerAccountType.PLATFORM_REVENUE,
          amount: commissionPaise,
          currency,
          description: `Platform commission (${commissionBps / 100}%) for booking ${bookingId}`,
        },
      });
    }

    // 3. Credit PROVIDER_PAYABLE (Liability owed to practitioner)
    if (providerSharePaise > 0) {
      await db.ledgerEntry.create({
        data: {
          bookingId,
          entryType: LedgerEntryType.CREDIT,
          accountType: LedgerAccountType.PROVIDER_PAYABLE,
          amount: providerSharePaise,
          currency,
          description: `Provider earnings payable for session ${bookingId}`,
        },
      });
    }

    return { commissionPaise, providerSharePaise };
  }

  /**
   * Records payout to provider's linked bank account.
   * Debit: PROVIDER_PAYABLE (Extinguishing payable liability)
   * Credit: CONSUMER_PAYMENT (Cash leaving platform clearing account)
   */
  async recordProviderPayout(
    payoutId: string,
    amountPaise: number,
    transferId: string,
    bookingId?: string,
    currency: string = 'INR',
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    const db = tx || prisma;
    this.logger.log(
      `Ledger: Recording payout ${payoutId} (Transfer: ${transferId}) of ₹${(amountPaise / 100).toFixed(2)}`,
    );

    // 1. Debit PROVIDER_PAYABLE
    await db.ledgerEntry.create({
      data: {
        payoutId,
        bookingId,
        entryType: LedgerEntryType.DEBIT,
        accountType: LedgerAccountType.PROVIDER_PAYABLE,
        amount: amountPaise,
        currency,
        description: `Payout transferred to provider (Transfer ID: ${transferId})`,
      },
    });

    // 2. Credit CONSUMER_PAYMENT (Funds disbursed from clearing)
    await db.ledgerEntry.create({
      data: {
        payoutId,
        bookingId,
        entryType: LedgerEntryType.CREDIT,
        accountType: LedgerAccountType.CONSUMER_PAYMENT,
        amount: amountPaise,
        currency,
        description: `Disbursement of payout ${payoutId} via gateway transfer`,
      },
    });
  }

  /**
   * Records refund to seeker (Full or Partial).
   * Debit: PLATFORM_ESCROW (Relieving escrow hold)
   * Credit: REFUND_ESCROW (Disbursed back to seeker)
   */
  async recordRefund(
    bookingId: string,
    refundAmountPaise: number,
    currency: string = 'INR',
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    if (refundAmountPaise <= 0) return;
    const db = tx || prisma;

    this.logger.log(
      `Ledger: Recording refund of ₹${(refundAmountPaise / 100).toFixed(2)} for booking ${bookingId}`,
    );

    // 1. Debit PLATFORM_ESCROW
    await db.ledgerEntry.create({
      data: {
        bookingId,
        entryType: LedgerEntryType.DEBIT,
        accountType: LedgerAccountType.PLATFORM_ESCROW,
        amount: refundAmountPaise,
        currency,
        description: `Refund debited from escrow for cancelled booking ${bookingId}`,
      },
    });

    // 2. Credit REFUND_ESCROW
    await db.ledgerEntry.create({
      data: {
        bookingId,
        entryType: LedgerEntryType.CREDIT,
        accountType: LedgerAccountType.REFUND_ESCROW,
        amount: refundAmountPaise,
        currency,
        description: `Refund returned to consumer payment source for booking ${bookingId}`,
      },
    });
  }

  /**
   * Daily reconciliation job: verifies that the double-entry ledger always balances
   * (Total Debits === Total Credits) and matches gateway payment and payout records.
   */
  async reconcileLedger(targetDate?: string): Promise<LedgerReconciliationResult> {
    this.logger.log(
      `Running daily financial ledger reconciliation (date: ${targetDate || 'ALL'})...`,
    );

    const whereClause: { createdAt?: { gte: Date; lte: Date } } = {};
    if (targetDate) {
      const start = new Date(targetDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(targetDate);
      end.setUTCHours(23, 59, 59, 999);
      whereClause.createdAt = { gte: start, lte: end };
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: whereClause,
    });

    let totalDebitsPaise = 0;
    let totalCreditsPaise = 0;

    for (const entry of entries) {
      if (entry.entryType === LedgerEntryType.DEBIT) {
        totalDebitsPaise += entry.amount;
      } else if (entry.entryType === LedgerEntryType.CREDIT) {
        totalCreditsPaise += entry.amount;
      }
    }

    const discrepancyPaise = totalDebitsPaise - totalCreditsPaise;
    const balanced = discrepancyPaise === 0;

    // Cross-verify captured payments with CONSUMER_PAYMENT ledger entries
    const capturedPayments = await prisma.payment.findMany({
      where: {
        status: 'CAPTURED',
        ...(whereClause.createdAt ? { createdAt: whereClause.createdAt } : {}),
      },
    });

    const paymentDiscrepancies: Array<{ paymentId: string; amountPaise: number; issue: string }> =
      [];
    for (const payment of capturedPayments) {
      const consumerEntry = entries.find(
        (e) =>
          e.bookingId === payment.bookingId &&
          e.accountType === LedgerAccountType.CONSUMER_PAYMENT &&
          e.entryType === LedgerEntryType.DEBIT &&
          e.amount === payment.amount,
      );
      if (!consumerEntry) {
        paymentDiscrepancies.push({
          paymentId: payment.id,
          amountPaise: payment.amount,
          issue: 'Missing matching CONSUMER_PAYMENT debit entry in ledger',
        });
      }
    }

    // Cross-verify settled payouts with PROVIDER_PAYABLE ledger entries
    const settledPayouts = await prisma.payout.findMany({
      where: {
        status: 'PAID',
        ...(whereClause.createdAt ? { createdAt: whereClause.createdAt } : {}),
      },
    });

    const payoutDiscrepancies: Array<{ payoutId: string; amountPaise: number; issue: string }> = [];
    for (const payout of settledPayouts) {
      const payoutEntry = entries.find(
        (e) =>
          e.payoutId === payout.id &&
          e.accountType === LedgerAccountType.PROVIDER_PAYABLE &&
          e.entryType === LedgerEntryType.DEBIT &&
          e.amount === payout.amount,
      );
      if (!payoutEntry) {
        payoutDiscrepancies.push({
          payoutId: payout.id,
          amountPaise: payout.amount,
          issue: 'Missing matching PROVIDER_PAYABLE debit entry in ledger',
        });
      }
    }

    if (!balanced || paymentDiscrepancies.length > 0 || payoutDiscrepancies.length > 0) {
      this.logger.error(
        `🚨 Financial ledger reconciliation MISMATCH: Debits: ₹${(totalDebitsPaise / 100).toFixed(2)}, ` +
          `Credits: ₹${(totalCreditsPaise / 100).toFixed(2)}, Discrepancy: ₹${(discrepancyPaise / 100).toFixed(2)}`,
      );
    } else {
      this.logger.log(
        `✅ Financial ledger reconciled successfully: Total debits: ₹${(totalDebitsPaise / 100).toFixed(2)} === Total credits: ₹${(totalCreditsPaise / 100).toFixed(2)}`,
      );
    }

    return {
      timestamp: new Date().toISOString(),
      balanced,
      totalDebitsPaise,
      totalCreditsPaise,
      discrepancyPaise,
      totalEntries: entries.length,
      paymentDiscrepancies,
      payoutDiscrepancies,
    };
  }
}

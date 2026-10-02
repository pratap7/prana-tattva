import { calculateCommissionAndShare, computeGstBreakdown } from '@project-nirvana/shared';
import { LedgerEntryType, LedgerAccountType } from '@project-nirvana/db';

describe('Financial Math & Double-Entry Ledger Integrity', () => {
  describe('Commission Rounding & Conservation of Paise', () => {
    test.each([
      [200000, 1500, 30000, 170000], // ₹2,000 @ 15% -> ₹300 comm, ₹1,700 provider
      [199900, 1500, 29985, 169915], // ₹1,999 @ 15% -> ₹299.85 comm, ₹1,699.15 provider
      [100, 1500, 15, 85], // ₹1.00 @ 15% -> 15 paise comm, 85 paise provider
      [7, 1500, 1, 6], // 7 paise @ 15% -> 1 paise comm, 6 paise provider
      [333333, 1250, 41667, 291666], // ₹3,333.33 @ 12.5%
      [500000, 2000, 100000, 400000], // ₹5,000 @ 20%
      [10000000, 1000, 1000000, 9000000], // ₹100,000 @ 10%
      [1, 1500, 0, 1], // 1 paise @ 15% -> 0 paise comm, 1 paise provider
      [0, 1500, 0, 0], // 0 paise
    ])(
      'for amount %i paise with %i bps commission -> %i comm + %i provider share strictly equals total',
      (totalPaise, commissionBps, expectedComm, expectedProvider) => {
        const { commissionPaise, providerSharePaise } = calculateCommissionAndShare(
          totalPaise,
          commissionBps,
        );

        expect(commissionPaise).toBe(expectedComm);
        expect(providerSharePaise).toBe(expectedProvider);
        expect(commissionPaise + providerSharePaise).toBe(totalPaise);
      },
    );

    it('should strictly conserve paise across 1,000 random currency amounts and commission rates', () => {
      // Fuzz test over 1,000 pseudo-random price amounts and commission rates
      for (let i = 0; i < 1000; i++) {
        const randomPaise = Math.floor(Math.random() * 10000000) + 1; // 1 paise to ₹100,000
        const randomBps = Math.floor(Math.random() * 3000); // 0% to 30%

        const { commissionPaise, providerSharePaise } = calculateCommissionAndShare(
          randomPaise,
          randomBps,
        );

        // Invariant: Zero paise created or lost
        expect(commissionPaise + providerSharePaise).toBe(randomPaise);
        expect(commissionPaise).toBeGreaterThanOrEqual(0);
        expect(providerSharePaise).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Partial Refund Math & Proportion Preservation', () => {
    it('should balance partial refund and remaining escrow distribution without fractional leakage', () => {
      const originalAmountPaise = 200000; // ₹2,000
      const commissionBps = 1500; // 15%
      const refundPercent = 50; // 50% moderate policy refund

      const refundAmountPaise = Math.round((originalAmountPaise * refundPercent) / 100);
      const remainingEscrowPaise = originalAmountPaise - refundAmountPaise;

      const { commissionPaise, providerSharePaise } = calculateCommissionAndShare(
        remainingEscrowPaise,
        commissionBps,
      );

      // Refunded to consumer + platform commission + provider share MUST equal original amount
      const totalAccountingSum = refundAmountPaise + commissionPaise + providerSharePaise;
      expect(totalAccountingSum).toBe(originalAmountPaise);

      expect(refundAmountPaise).toBe(100000); // ₹1,000
      expect(commissionPaise).toBe(15000); // ₹150
      expect(providerSharePaise).toBe(85000); // ₹850
    });

    it('should balance an asymmetric partial refund (e.g. 33.33% refund on prime amount)', () => {
      const originalAmountPaise = 179900; // ₹1,799
      const refundAmountPaise = 60000; // ₹600 partial refund
      const remainingEscrowPaise = originalAmountPaise - refundAmountPaise; // 119,900
      const commissionBps = 1500;

      const { commissionPaise, providerSharePaise } = calculateCommissionAndShare(
        remainingEscrowPaise,
        commissionBps,
      );

      expect(refundAmountPaise + commissionPaise + providerSharePaise).toBe(originalAmountPaise);
    });
  });

  describe('Indian GST Breakdown Calculations (SAC 998399)', () => {
    test.each([
      [200000, 1800], // ₹2,000 @ 18% inclusive
      [150000, 1800], // ₹1,500 @ 18% inclusive
      [99900, 1800], // ₹999 @ 18% inclusive
      [5000, 1800], // ₹50 @ 18% inclusive
      [1, 1800], // 1 paise
    ])(
      'for ₹%i paise inclusive GST: baseAmount + totalTax strictly equals total',
      (totalPaise, rateBps) => {
        const gst = computeGstBreakdown(totalPaise, rateBps);

        expect(gst.baseAmount + gst.totalTax).toBe(totalPaise);
        expect(gst.cgst + gst.sgst).toBe(gst.totalTax);
        expect(gst.sacCode).toBe('998399');
        expect(gst.currency).toBe('INR');
      },
    );
  });

  describe('Double-Entry Ledger Always Balances Invariant', () => {
    interface LedgerEntryMock {
      entryType: LedgerEntryType;
      accountType: LedgerAccountType;
      amount: number;
    }

    it('should maintain exact equality between total debits and total credits across complete booking lifecycle', () => {
      const ledger: LedgerEntryMock[] = [];

      const recordEntry = (
        entryType: LedgerEntryType,
        accountType: LedgerAccountType,
        amount: number,
      ) => {
        ledger.push({ entryType, accountType, amount });
      };

      const bookingAmount = 250000; // ₹2,500
      const commissionBps = 1500; // 15%

      // 1. Customer Payment Captured
      recordEntry(LedgerEntryType.DEBIT, LedgerAccountType.CONSUMER_PAYMENT, bookingAmount);
      recordEntry(LedgerEntryType.CREDIT, LedgerAccountType.PLATFORM_ESCROW, bookingAmount);

      // Check balance after Step 1
      let debits = ledger
        .filter((e) => e.entryType === LedgerEntryType.DEBIT)
        .reduce((sum, e) => sum + e.amount, 0);
      let credits = ledger
        .filter((e) => e.entryType === LedgerEntryType.CREDIT)
        .reduce((sum, e) => sum + e.amount, 0);
      expect(debits).toBe(credits);

      // 2. Session Completed: Escrow Release
      const { commissionPaise, providerSharePaise } = calculateCommissionAndShare(
        bookingAmount,
        commissionBps,
      );
      recordEntry(LedgerEntryType.DEBIT, LedgerAccountType.PLATFORM_ESCROW, bookingAmount);
      recordEntry(LedgerEntryType.CREDIT, LedgerAccountType.PLATFORM_REVENUE, commissionPaise);
      recordEntry(LedgerEntryType.CREDIT, LedgerAccountType.PROVIDER_PAYABLE, providerSharePaise);

      // Check balance after Step 2
      debits = ledger
        .filter((e) => e.entryType === LedgerEntryType.DEBIT)
        .reduce((sum, e) => sum + e.amount, 0);
      credits = ledger
        .filter((e) => e.entryType === LedgerEntryType.CREDIT)
        .reduce((sum, e) => sum + e.amount, 0);
      expect(debits).toBe(credits);

      // 3. Provider Payout Transferred
      recordEntry(LedgerEntryType.DEBIT, LedgerAccountType.PROVIDER_PAYABLE, providerSharePaise);
      recordEntry(LedgerEntryType.CREDIT, LedgerAccountType.CONSUMER_PAYMENT, providerSharePaise);

      // Check balance after Step 3
      debits = ledger
        .filter((e) => e.entryType === LedgerEntryType.DEBIT)
        .reduce((sum, e) => sum + e.amount, 0);
      credits = ledger
        .filter((e) => e.entryType === LedgerEntryType.CREDIT)
        .reduce((sum, e) => sum + e.amount, 0);
      expect(debits).toBe(credits);

      // Verify net account balances
      const consumerCashNet =
        ledger
          .filter(
            (e) =>
              e.accountType === LedgerAccountType.CONSUMER_PAYMENT &&
              e.entryType === LedgerEntryType.DEBIT,
          )
          .reduce((s, e) => s + e.amount, 0) -
        ledger
          .filter(
            (e) =>
              e.accountType === LedgerAccountType.CONSUMER_PAYMENT &&
              e.entryType === LedgerEntryType.CREDIT,
          )
          .reduce((s, e) => s + e.amount, 0);
      expect(consumerCashNet).toBe(commissionPaise); // Platform retains its commission cash!
    });
  });
});

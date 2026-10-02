import { calculateRefund, CancellationPolicy } from '@project-nirvana/shared';

describe('calculateRefund (Refund Calculation Table Tests)', () => {
  const BASE_PRICE = 200000; // ₹2,000 (200,000 paise)

  describe('Provider Cancellations (Always 100% refund)', () => {
    const providerCases: Array<{
      policy: CancellationPolicy;
      hoursBefore: number;
    }> = [
      { policy: 'FLEXIBLE', hoursBefore: 120 },
      { policy: 'FLEXIBLE', hoursBefore: 24 },
      { policy: 'FLEXIBLE', hoursBefore: 2 },
      { policy: 'FLEXIBLE', hoursBefore: 0.1 },
      { policy: 'MODERATE', hoursBefore: 72 },
      { policy: 'MODERATE', hoursBefore: 12 },
      { policy: 'STRICT', hoursBefore: 168 },
      { policy: 'STRICT', hoursBefore: 24 },
      { policy: 'STRICT', hoursBefore: 1 },
      { policy: 'STRICT', hoursBefore: -1 }, // Even post-start time
    ];

    test.each(providerCases)(
      'Provider cancellation with $policy policy at $hoursBefore hours gives 100% refund',
      ({ policy, hoursBefore }) => {
        const result = calculateRefund(policy, BASE_PRICE, hoursBefore, 'PROVIDER');

        expect(result.refundPercentage).toBe(100);
        expect(result.refundPaise).toBe(BASE_PRICE);
        expect(result.refundRupees).toBe(2000);
        expect(result.cancelledBy).toBe('PROVIDER');
        expect(result.explanation).toContain('Provider cancellation guarantees a 100% full refund');
      },
    );
  });

  describe('Consumer Cancellations Matrix', () => {
    const consumerCases: Array<{
      policy: CancellationPolicy;
      hoursBefore: number;
      expectedPercentage: number;
      expectedPaise: number;
      description: string;
    }> = [
      // FLEXIBLE Policy
      {
        policy: 'FLEXIBLE',
        hoursBefore: 72,
        expectedPercentage: 100,
        expectedPaise: 200000,
        description: '>= 24h prior yields 100% full refund',
      },
      {
        policy: 'FLEXIBLE',
        hoursBefore: 24,
        expectedPercentage: 100,
        expectedPaise: 200000,
        description: 'Exactly 24h prior yields 100% full refund',
      },
      {
        policy: 'FLEXIBLE',
        hoursBefore: 23.9,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: 'Just under 24h yields 0% refund',
      },
      {
        policy: 'FLEXIBLE',
        hoursBefore: 2,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: '2h prior yields 0% refund',
      },
      {
        policy: 'FLEXIBLE',
        hoursBefore: 0,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: '0h (session start) yields 0% refund',
      },
      {
        policy: 'FLEXIBLE',
        hoursBefore: -2,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: 'Post-session elapsed yields 0% refund',
      },

      // MODERATE Policy
      {
        policy: 'MODERATE',
        hoursBefore: 72,
        expectedPercentage: 100,
        expectedPaise: 200000,
        description: '>= 48h prior yields 100% full refund',
      },
      {
        policy: 'MODERATE',
        hoursBefore: 48,
        expectedPercentage: 100,
        expectedPaise: 200000,
        description: 'Exactly 48h prior yields 100% full refund',
      },
      {
        policy: 'MODERATE',
        hoursBefore: 36,
        expectedPercentage: 50,
        expectedPaise: 100000,
        description: 'Between 24h and 48h yields 50% refund',
      },
      {
        policy: 'MODERATE',
        hoursBefore: 24,
        expectedPercentage: 50,
        expectedPaise: 100000,
        description: 'Exactly 24h prior yields 50% refund',
      },
      {
        policy: 'MODERATE',
        hoursBefore: 12,
        expectedPercentage: 50,
        expectedPaise: 100000,
        description: 'Within 24h yields 50% refund per policy',
      },
      {
        policy: 'MODERATE',
        hoursBefore: 0,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: 'Session start yields 0% refund',
      },

      // STRICT Policy
      {
        policy: 'STRICT',
        hoursBefore: 168, // 7 days
        expectedPercentage: 50,
        expectedPaise: 100000,
        description: '168h (7 days) prior yields 50% refund',
      },
      {
        policy: 'STRICT',
        hoursBefore: 48,
        expectedPercentage: 50,
        expectedPaise: 100000,
        description: 'Exactly 48h prior yields 50% refund',
      },
      {
        policy: 'STRICT',
        hoursBefore: 47.9,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: 'Within 48h yields 0% refund',
      },
      {
        policy: 'STRICT',
        hoursBefore: 24,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: '24h prior yields 0% refund',
      },
      {
        policy: 'STRICT',
        hoursBefore: 1,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: '1h prior yields 0% refund',
      },
      {
        policy: 'STRICT',
        hoursBefore: -1,
        expectedPercentage: 0,
        expectedPaise: 0,
        description: 'Post-session elapsed yields 0% refund',
      },
    ];

    test.each(consumerCases)(
      'Consumer $policy at $hoursBefore hours -> $expectedPercentage% (₹$expectedPaise/100): $description',
      ({ policy, hoursBefore, expectedPercentage, expectedPaise }) => {
        const result = calculateRefund(policy, BASE_PRICE, hoursBefore, 'CONSUMER');

        expect(result.refundPercentage).toBe(expectedPercentage);
        expect(result.refundPaise).toBe(expectedPaise);
        expect(result.refundRupees).toBe(Math.round(expectedPaise / 100));
        expect(result.policy).toBe(policy);
        expect(result.cancelledBy).toBe('CONSUMER');
      },
    );
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { PostgresSearchService } from './postgres-search.service';
import { VerificationTier, ServiceMode } from '@project-nirvana/shared';

describe('PostgresSearchService', () => {
  let service: PostgresSearchService;
  let mockPrisma: any;

  const sampleProviders = [
    {
      id: 'prov-1',
      userId: 'user-1',
      displayName: 'Acharya Shankara',
      slug: 'acharya-shankara',
      headline: 'Master Vedic Astrology and Jyotish Consultant',
      bio: 'Deep Vedic astrological readings, kundali analysis, and spiritual guidance based in sacred traditions.',
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
      city: 'Rishikesh',
      country: 'IN',
      languages: ['en', 'hi', 'sa'],
      verificationTier: 'BACKGROUND_CHECKED' as VerificationTier,
      approvalStatus: 'APPROVED',
      ratingAvg: '4.95',
      ratingCount: 150,
      completedSessions: 320,
      responseRate: 99,
      minNoticeHours: 4,
      categories: [
        {
          isPrimary: true,
          category: {
            id: 'cat-astrology',
            name: 'Vedic Astrology',
            slug: 'astrology',
            requiresLicense: false,
          },
        },
      ],
      services: [
        {
          id: 'svc-1',
          title: 'Natal Kundali & Planetary Alignment',
          description: 'Comprehensive 60-minute Vedic birth chart consultation',
          priceAmount: 450000, // ₹4,500
          currency: 'INR',
          mode: 'ONLINE' as ServiceMode,
          isActive: true,
        },
      ],
      availabilityRules: [
        {
          weekday: 'MONDAY',
          startTime: '09:00',
          endTime: '17:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
        {
          weekday: 'TUESDAY',
          startTime: '09:00',
          endTime: '17:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
      ],
      availabilityExceptions: [],
    },
    {
      id: 'prov-2',
      userId: 'user-2',
      displayName: 'Mira Devi',
      slug: 'mira-devi',
      headline: 'Certified Usui & Karuna Reiki Master Teacher',
      bio: 'Gentle energetic chakra balancing and distance energy clearing sessions for profound inner stillness.',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
      city: 'Bengaluru',
      country: 'IN',
      languages: ['en', 'kn'],
      verificationTier: 'CREDENTIAL_VERIFIED' as VerificationTier,
      approvalStatus: 'APPROVED',
      ratingAvg: '5.00',
      ratingCount: 1, // ONLY ONE REVIEW!
      completedSessions: 2,
      responseRate: 90,
      minNoticeHours: 2,
      categories: [
        {
          isPrimary: true,
          category: {
            id: 'cat-reiki',
            name: 'Reiki Healing',
            slug: 'reiki',
            requiresLicense: false,
          },
        },
      ],
      services: [
        {
          id: 'svc-2',
          title: 'Distance Reiki Chakra Balancing',
          description: '45-minute remote energy harmony',
          priceAmount: 180000, // ₹1,800
          currency: 'INR',
          mode: 'ONLINE' as ServiceMode,
          isActive: true,
        },
      ],
      availabilityRules: [
        {
          weekday: 'WEDNESDAY',
          startTime: '10:00',
          endTime: '18:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
      ],
      availabilityExceptions: [],
    },
    {
      id: 'prov-3',
      userId: 'user-3',
      displayName: 'Dr. Arjun Roy',
      slug: 'dr-arjun-roy',
      headline: 'Licensed Clinical Psychologist & Mindfulness Therapist',
      bio: 'Evidence-based cognitive behavioral therapy and mindful somatic integration for stress and trauma.',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
      city: 'Mumbai',
      country: 'IN',
      languages: ['en', 'hi', 'mr'],
      verificationTier: 'BACKGROUND_CHECKED' as VerificationTier,
      approvalStatus: 'APPROVED',
      ratingAvg: '4.88',
      ratingCount: 85,
      completedSessions: 190,
      responseRate: 98,
      minNoticeHours: 6,
      categories: [
        {
          isPrimary: true,
          category: {
            id: 'cat-psych',
            name: 'Psychotherapy',
            slug: 'psychotherapy',
            requiresLicense: true,
          },
        },
      ],
      services: [
        {
          id: 'svc-3',
          title: 'Individual Somatic Psychotherapy',
          description: '60-minute clinical counseling',
          priceAmount: 300000, // ₹3,000
          currency: 'INR',
          mode: 'BOTH' as ServiceMode,
          isActive: true,
        },
      ],
      availabilityRules: [
        {
          weekday: 'THURSDAY',
          startTime: '11:00',
          endTime: '19:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
      ],
      availabilityExceptions: [],
    },
  ];

  beforeEach(async () => {
    mockPrisma = {
      providerProfile: {
        findMany: jest.fn().mockImplementation(async () => sampleProviders),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cat-astrology',
            name: 'Vedic Astrology',
            slug: 'astrology',
            _count: { providers: 1 },
          },
          { id: 'cat-reiki', name: 'Reiki Healing', slug: 'reiki', _count: { providers: 1 } },
          {
            id: 'cat-psych',
            name: 'Psychotherapy',
            slug: 'psychotherapy',
            _count: { providers: 1 },
          },
        ]),
      },
      service: {
        aggregate: jest.fn().mockResolvedValue({
          _min: { priceAmount: 180000 },
          _max: { priceAmount: 450000 },
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresSearchService,
        {
          provide: 'PRISMA_CLIENT',
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PostgresSearchService>(PostgresSearchService);
  });

  describe('Bayesian Ranking Principle', () => {
    it('ranks a provider with 150 reviews at 4.95 ABOVE a provider with only 1 review at 5.00', async () => {
      const result = await service.searchProviders({
        sortBy: 'RATING',
      });

      expect(result.items.length).toBeGreaterThanOrEqual(2);

      // Acharya Shankara (150 reviews, 4.95) must rank ahead of Mira Devi (1 review, 5.00)
      const shankaraIndex = result.items.findIndex((item) => item.slug === 'acharya-shankara');
      const miraIndex = result.items.findIndex((item) => item.slug === 'mira-devi');

      expect(shankaraIndex).toBeLessThan(miraIndex);
    });
  });

  describe('Full-text and Typo-tolerant Trigram Search', () => {
    it('finds astrology provider when searching keyword "astrology"', async () => {
      const result = await service.searchProviders({
        q: 'astrology',
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].slug).toBe('acharya-shankara');
    });

    it('matches with typo tolerance for "reki" or "mira"', async () => {
      const result = await service.searchProviders({
        q: 'mira reki',
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].slug).toBe('mira-devi');
    });

    it('weights name higher than bio in search relevance', async () => {
      const result = await service.searchProviders({
        q: 'Arjun',
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].displayName).toContain('Arjun');
    });
  });

  describe('Filter Capabilities', () => {
    it('filters by category slug', async () => {
      const result = await service.searchProviders({
        category: 'reiki',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].slug).toBe('mira-devi');
    });

    it('filters by price range (in rupees)', async () => {
      const result = await service.searchProviders({
        minPrice: 2000,
        maxPrice: 3500,
      });

      // Dr. Arjun Roy starting price is ₹3,000 (300000 paise)
      expect(result.items.some((i) => i.slug === 'dr-arjun-roy')).toBe(true);
      // Mira Devi starting price is ₹1,800 (under 2000)
      expect(result.items.some((i) => i.slug === 'mira-devi')).toBe(false);
    });

    it('filters by session mode', async () => {
      const result = await service.searchProviders({
        mode: 'IN_PERSON' as ServiceMode,
      });

      // Only Dr. Roy offers IN_PERSON (via mode: BOTH)
      expect(result.items).toHaveLength(1);
      expect(result.items[0].slug).toBe('dr-arjun-roy');
    });

    it('filters by city location', async () => {
      const result = await service.searchProviders({
        city: 'Rishikesh',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].displayName).toBe('Acharya Shankara');
    });

    it('filters by spoken language', async () => {
      const result = await service.searchProviders({
        language: 'kn',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].displayName).toBe('Mira Devi');
    });

    it('filters by minimum rating', async () => {
      const result = await service.searchProviders({
        minRating: 4.9,
      });

      expect(result.items.every((i) => i.ratingAvg >= 4.9)).toBe(true);
    });

    it('filters by verification tier', async () => {
      const result = await service.searchProviders({
        verificationTier: 'BACKGROUND_CHECKED' as VerificationTier,
      });

      expect(result.items.every((i) => i.verificationTier === 'BACKGROUND_CHECKED')).toBe(true);
    });
  });

  describe('Sorting and Cursor Pagination', () => {
    it('sorts by price ascending', async () => {
      const result = await service.searchProviders({
        sortBy: 'PRICE_ASC',
      });

      const prices = result.items.map((i) => i.startingPricePaise);
      for (let i = 0; i < prices.length - 1; i++) {
        expect(prices[i]).toBeLessThanOrEqual(prices[i + 1]);
      }
    });

    it('paginates using cursor token', async () => {
      const page1 = await service.searchProviders({
        limit: 2,
      });

      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await service.searchProviders({
        limit: 2,
        cursor: page1.nextCursor!,
      });

      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      expect(page2.items[0].id).not.toBe(page1.items[0].id);
      expect(page2.items[0].id).not.toBe(page1.items[1].id);
    });
  });
});

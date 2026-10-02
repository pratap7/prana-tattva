/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { VerificationTier, ServiceMode } from '@project-nirvana/shared';
import { prisma } from '@project-nirvana/db';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Provider Discovery & Search (e2e)', () => {
  let app: INestApplication;

  const mockApprovedProviders = [
    {
      id: 'prov-search-1',
      userId: 'user-search-1',
      displayName: 'Yogini Ananya Sharma',
      slug: 'ananya-sharma-search',
      headline: 'Hatha & Vinyasa Yoga Guide | Sacred Pranayama Teacher',
      bio: 'Over a decade of classical Himalayan yoga training guiding students to breath awareness and somatic vitality.',
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2',
      city: 'Rishikesh',
      country: 'IN',
      languages: ['en', 'hi'],
      verificationTier: 'BACKGROUND_CHECKED' as VerificationTier,
      approvalStatus: 'APPROVED',
      ratingAvg: '4.92',
      ratingCount: 120,
      completedSessions: 250,
      responseRate: 98,
      minNoticeHours: 4,
      categories: [
        {
          isPrimary: true,
          category: {
            id: 'cat-yoga',
            name: 'Yoga & Pranayama',
            slug: 'yoga',
            requiresLicense: false,
          },
        },
      ],
      services: [
        {
          id: 'svc-yoga-1',
          title: 'Private 1:1 Hatha Yoga Immersion',
          description: 'Customized postural alignment and breathwork session',
          priceAmount: 250000, // ₹2,500
          currency: 'INR',
          mode: 'ONLINE' as ServiceMode,
          isActive: true,
        },
      ],
      availabilityRules: [
        {
          weekday: 'MONDAY',
          startTime: '08:00',
          endTime: '16:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
      ],
      availabilityExceptions: [],
    },
    {
      id: 'prov-search-2',
      userId: 'user-search-2',
      displayName: 'Pandit Rajesh Shastri',
      slug: 'rajesh-shastri-search',
      headline: 'Traditional Vedic Astrologer & Kundali Master',
      bio: 'Ancient Vedic chart analysis, dasha predictions, and gemstone guidance.',
      avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d',
      city: 'Varanasi',
      country: 'IN',
      languages: ['hi', 'sa'],
      verificationTier: 'CREDENTIAL_VERIFIED' as VerificationTier,
      approvalStatus: 'APPROVED',
      ratingAvg: '4.85',
      ratingCount: 75,
      completedSessions: 160,
      responseRate: 92,
      minNoticeHours: 6,
      categories: [
        {
          isPrimary: true,
          category: {
            id: 'cat-astro',
            name: 'Vedic Astrology',
            slug: 'astrology',
            requiresLicense: false,
          },
        },
      ],
      services: [
        {
          id: 'svc-astro-1',
          title: 'Complete Kundali Life Path Consultation',
          description: 'Detailed analysis of planetary transits and karmic blueprints',
          priceAmount: 400000, // ₹4,000
          currency: 'INR',
          mode: 'BOTH' as ServiceMode,
          isActive: true,
        },
      ],
      availabilityRules: [
        {
          weekday: 'TUESDAY',
          startTime: '10:00',
          endTime: '18:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
      ],
      availabilityExceptions: [],
    },
    {
      id: 'prov-search-3',
      userId: 'user-search-3',
      displayName: 'Dr. Devika Sen',
      slug: 'devika-sen-search',
      headline: 'Licensed Psychotherapist & Somatic Counselor',
      bio: 'Trauma-informed therapeutic space cultivating emotional freedom and resilience.',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
      city: 'Bengaluru',
      country: 'IN',
      languages: ['en', 'bn'],
      verificationTier: 'BACKGROUND_CHECKED' as VerificationTier,
      approvalStatus: 'APPROVED',
      ratingAvg: '4.98',
      ratingCount: 200,
      completedSessions: 420,
      responseRate: 100,
      minNoticeHours: 2,
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
          id: 'svc-psych-1',
          title: 'Clinical Mindfulness Psychotherapy',
          description: '60-minute evidence-based healing conversation',
          priceAmount: 350000, // ₹3,500
          currency: 'INR',
          mode: 'ONLINE' as ServiceMode,
          isActive: true,
        },
      ],
      availabilityRules: [
        {
          weekday: 'WEDNESDAY',
          startTime: '09:00',
          endTime: '17:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
      ],
      availabilityExceptions: [],
    },
  ];

  beforeAll(async () => {
    jest.spyOn(prisma.providerProfile, 'findMany').mockResolvedValue(mockApprovedProviders as any);
    jest.spyOn(prisma.category, 'findMany').mockResolvedValue([
      { id: 'cat-yoga', name: 'Yoga & Pranayama', slug: 'yoga', _count: { providers: 1 } },
      { id: 'cat-astro', name: 'Vedic Astrology', slug: 'astrology', _count: { providers: 1 } },
      { id: 'cat-psych', name: 'Psychotherapy', slug: 'psychotherapy', _count: { providers: 1 } },
    ] as any);
    jest.spyOn(prisma.service, 'aggregate').mockResolvedValue({
      _min: { priceAmount: 250000 },
      _max: { priceAmount: 400000 },
    } as any);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/providers/search', () => {
    it('returns matched providers and default facets', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/providers/search').expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('totalCount');
      expect(res.body).toHaveProperty('facets');
      expect(res.body.items.length).toBe(3);
    });

    it('filters by category slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers/search?category=yoga')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].slug).toBe('ananya-sharma-search');
    });

    it('filters by keyword query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers/search?q=astrology')
        .expect(200);

      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items[0].slug).toBe('rajesh-shastri-search');
    });

    it('filters by price range (in rupees)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers/search?minPrice=3000&maxPrice=4000')
        .expect(200);

      const slugs = res.body.items.map((i: any) => i.slug);
      expect(slugs).toContain('rajesh-shastri-search'); // ₹4,000
      expect(slugs).toContain('devika-sen-search'); // ₹3,500
      expect(slugs).not.toContain('ananya-sharma-search'); // ₹2,500
    });

    it('filters by session mode (IN_PERSON)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers/search?mode=IN_PERSON')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].slug).toBe('rajesh-shastri-search');
    });

    it('filters by city location', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers/search?city=Rishikesh')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].city).toBe('Rishikesh');
    });

    it('filters by minimum rating floor', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers/search?minRating=4.95')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].slug).toBe('devika-sen-search');
    });

    it('sorts by price ascending', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers/search?sortBy=PRICE_ASC')
        .expect(200);

      const prices = res.body.items.map((i: any) => i.startingPricePaise);
      expect(prices[0]).toBeLessThanOrEqual(prices[1]);
      expect(prices[1]).toBeLessThanOrEqual(prices[2]);
    });

    it('supports cursor-based pagination', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api/v1/providers/search?limit=2')
        .expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).toBeDefined();

      const page2 = await request(app.getHttpServer())
        .get(`/api/v1/providers/search?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();
    });
  });

  describe('GET /api/v1/providers/facets', () => {
    it('returns active filter facets for discovery UI', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/providers/facets').expect(200);

      expect(res.body).toHaveProperty('categories');
      expect(res.body).toHaveProperty('cities');
      expect(res.body).toHaveProperty('languages');
      expect(res.body).toHaveProperty('priceRange');
    });
  });
});

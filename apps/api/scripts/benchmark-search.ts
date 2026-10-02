import { PostgresSearchService } from '../src/modules/search/services/postgres-search.service';
import {
  ProviderSearchQueryDto,
  VerificationTier,
  ServiceMode,
  Weekday,
} from '@project-nirvana/shared';
import { performance } from 'perf_hooks';

interface Mock10kProvider {
  id: string;
  userId: string;
  displayName: string;
  slug: string;
  headline: string;
  bio: string;
  avatarUrl: string | null;
  city: string;
  country: string;
  languages: string[];
  verificationTier: VerificationTier;
  approvalStatus: string;
  ratingAvg: number;
  ratingCount: number;
  completedSessions: number;
  responseRate: number;
  minNoticeHours: number;
  categories: {
    isPrimary: boolean;
    category: {
      id: string;
      name: string;
      slug: string;
      requiresLicense: boolean;
    };
  }[];
  services: {
    id: string;
    title: string;
    description: string;
    priceAmount: number;
    currency: string;
    mode: ServiceMode;
    isActive: boolean;
  }[];
  availabilityRules: {
    weekday: Weekday;
    startTime: string;
    endTime: string;
    providerTimeZone: string;
    isActive: boolean;
  }[];
  availabilityExceptions: any[];
}

const FIRST_NAMES = [
  'Aarav',
  'Aditi',
  'Ananya',
  'Arjun',
  'Bhavna',
  'Chetan',
  'Devika',
  'Gaurav',
  'Harish',
  'Ishaan',
  'Jaya',
  'Kavita',
  'Lakshmi',
  'Mira',
  'Neha',
  'Omkar',
  'Pooja',
  'Pranav',
  'Priya',
  'Rajesh',
  'Rohan',
  'Sadhana',
  'Sameer',
  'Shankara',
  'Sunita',
  'Tanvi',
  'Uma',
  'Varun',
  'Vidya',
];

const LAST_NAMES = [
  'Acharya',
  'Bhattacharya',
  'Deshmukh',
  'Gupta',
  'Iyer',
  'Joshi',
  'Kulkarni',
  'Maharaj',
  'Mishra',
  'Mukherjee',
  'Nair',
  'Patel',
  'Rao',
  'Reddy',
  'Roy',
  'Saraswati',
  'Sen',
  'Sharma',
  'Shastri',
  'Singh',
  'Trivedi',
  'Varma',
];

const CITIES = [
  'Rishikesh',
  'Mumbai',
  'Bengaluru',
  'Delhi',
  'Goa',
  'Varanasi',
  'Pune',
  'Chennai',
  'Kolkata',
  'Hyderabad',
];

const CATEGORIES = [
  { id: 'cat-yoga', name: 'Yoga & Pranayama', slug: 'yoga', requiresLicense: false },
  { id: 'cat-astrology', name: 'Vedic Astrology', slug: 'astrology', requiresLicense: false },
  { id: 'cat-reiki', name: 'Reiki Healing', slug: 'reiki', requiresLicense: false },
  {
    id: 'cat-psych',
    name: 'Psychotherapy & Counseling',
    slug: 'psychotherapy',
    requiresLicense: true,
  },
  {
    id: 'cat-sound',
    name: 'Sound & Vibration Healing',
    slug: 'sound-healing',
    requiresLicense: false,
  },
  {
    id: 'cat-pranic',
    name: 'Pranic Healing & Biofield',
    slug: 'pranic-healing',
    requiresLicense: false,
  },
  {
    id: 'cat-ayurveda',
    name: 'Ayurvedic Wellness & Dinacharya',
    slug: 'ayurveda',
    requiresLicense: false,
  },
  {
    id: 'cat-meditation',
    name: 'Meditation & Mindfulness',
    slug: 'meditation',
    requiresLicense: false,
  },
];

const WEEKDAYS_LIST: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

function generate10kProviders(): Mock10kProvider[] {
  console.log('Generating 10,000 synthetic provider records in memory for benchmark...');
  const providers: Mock10kProvider[] = [];

  for (let i = 0; i < 10000; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    const displayName = `${firstName} ${lastName}`;
    const slug = `${firstName.toLowerCase()}-${lastName.toLowerCase()}-${i}`;
    const city = CITIES[i % CITIES.length];
    const cat = CATEGORIES[i % CATEGORIES.length];

    const ratingCount = Math.floor(Math.random() * 300);
    const ratingAvg = Number((4.0 + Math.random() * 1.0).toFixed(2));
    const completedSessions = Math.floor(ratingCount * (1.5 + Math.random()));
    const responseRate = 85 + Math.floor(Math.random() * 16);

    const tierRoll = Math.random();
    const verificationTier: VerificationTier =
      tierRoll > 0.6
        ? 'BACKGROUND_CHECKED'
        : tierRoll > 0.3
          ? 'CREDENTIAL_VERIFIED'
          : tierRoll > 0.1
            ? 'ID_VERIFIED'
            : 'UNVERIFIED';

    const mode: ServiceMode = i % 3 === 0 ? 'ONLINE' : i % 3 === 1 ? 'IN_PERSON' : 'BOTH';
    const priceAmount = (1000 + (i % 40) * 100) * 100; // ₹1,000 to ₹5,000

    providers.push({
      id: `prov-10k-${i}`,
      userId: `user-10k-${i}`,
      displayName,
      slug,
      headline: `Certified Practitioner in ${cat.name}`,
      bio: `Holistic practitioner with over ${5 + (i % 20)} years of dedicated spiritual and wellness practice in ${city}.`,
      avatarUrl: `https://images.unsplash.com/photo-${1500000000000 + i}`,
      city,
      country: 'IN',
      languages: i % 2 === 0 ? ['en', 'hi'] : ['en', 'hi', 'sa'],
      verificationTier,
      approvalStatus: 'APPROVED',
      ratingAvg,
      ratingCount,
      completedSessions,
      responseRate,
      minNoticeHours: 4,
      categories: [
        {
          isPrimary: true,
          category: cat,
        },
      ],
      services: [
        {
          id: `svc-10k-${i}`,
          title: `1:1 Classical ${cat.name} Consultation`,
          description: 'Comprehensive healing session tailored to individual constitutional needs.',
          priceAmount,
          currency: 'INR',
          mode,
          isActive: true,
        },
      ],
      availabilityRules: [
        {
          weekday: WEEKDAYS_LIST[i % WEEKDAYS_LIST.length],
          startTime: '09:00',
          endTime: '17:00',
          providerTimeZone: 'Asia/Kolkata',
          isActive: true,
        },
      ],
      availabilityExceptions: [],
    });
  }

  console.log(`Generated ${providers.length} provider records.`);
  return providers;
}

async function runBenchmark() {
  console.log('\n================================================================');
  console.log(' PROJECT NIRVANA: PROVIDER SEARCH ENGINE PERFORMANCE BENCHMARK');
  console.log(' Performance Budget Target: p95 latency < 300 ms at 10,000 providers');
  console.log('================================================================\n');

  const dataset = generate10kProviders();

  // Create mock Prisma service wrapping the 10,000 dataset
  const mockPrismaClient: any = {
    providerProfile: {
      findMany: async () => dataset,
    },
    category: {
      findMany: async () =>
        CATEGORIES.map((c) => ({
          ...c,
          _count: { providers: 1250 },
        })),
    },
    service: {
      aggregate: async () => ({
        _min: { priceAmount: 100000 },
        _max: { priceAmount: 500000 },
      }),
    },
  };

  const searchService = new PostgresSearchService(mockPrismaClient);

  // Diverse test scenarios
  const testQueries: { name: string; query: ProviderSearchQueryDto }[] = [
    { name: 'Keyword search: "Yoga"', query: { q: 'Yoga' } },
    { name: 'Keyword search: "Reiki"', query: { q: 'Reiki' } },
    { name: 'Typo search: "yga breath"', query: { q: 'yga breath' } },
    { name: 'Typo search: "reki master"', query: { q: 'reki master' } },
    { name: 'Category filter: "astrology"', query: { category: 'astrology' } },
    { name: 'Category + Mode: "reiki" + ONLINE', query: { category: 'reiki', mode: 'ONLINE' } },
    { name: 'City filter: "Rishikesh"', query: { city: 'Rishikesh' } },
    { name: 'City + Mode: "Mumbai" + IN_PERSON', query: { city: 'Mumbai', mode: 'IN_PERSON' } },
    { name: 'Price range: ₹2,000 to ₹3,500', query: { minPrice: 2000, maxPrice: 3500 } },
    { name: 'Rating filter: 4.8+ stars', query: { minRating: 4.8 } },
    {
      name: 'Verification tier: BACKGROUND_CHECKED',
      query: { verificationTier: 'BACKGROUND_CHECKED' as VerificationTier },
    },
    { name: 'Sort by: RATING (Bayesian average)', query: { sortBy: 'RATING' } },
    { name: 'Sort by: PRICE_ASC', query: { sortBy: 'PRICE_ASC' } },
    { name: 'Sort by: PRICE_DESC', query: { sortBy: 'PRICE_DESC' } },
    {
      name: 'Full multi-filter: Yoga in Rishikesh, ONLINE, 4.5+ rating, ₹1,500 - ₹4,000',
      query: {
        category: 'yoga',
        city: 'Rishikesh',
        mode: 'ONLINE',
        minRating: 4.5,
        minPrice: 1500,
        maxPrice: 4000,
        sortBy: 'RELEVANCE',
      },
    },
  ];

  // Warmup run
  console.log('Executing warmup passes...');
  for (let w = 0; w < 5; w++) {
    await searchService.searchProviders({ q: 'yoga' });
  }

  // Benchmark: Execute 100 queries across the varied suite
  const totalIterations = 100;
  const latencies: number[] = [];
  console.log(`Running ${totalIterations} search operations against 10,000 providers...\n`);

  for (let i = 0; i < totalIterations; i++) {
    const testCase = testQueries[i % testQueries.length];
    const t0 = performance.now();
    const result = await searchService.searchProviders(testCase.query);
    const t1 = performance.now();

    const elapsedMs = t1 - t0;
    latencies.push(elapsedMs);

    if (result.items.length === 0 && !testCase.query.minRating) {
      console.warn(`Warning: query ${testCase.name} returned 0 results.`);
    }
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const avg = sum / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p90 = latencies[Math.floor(latencies.length * 0.9)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log('--- BENCHMARK RESULTS (10,000 Providers Dataset) ---');
  console.log(`Total Requests Tested : ${totalIterations}`);
  console.log(`Min Latency           : ${min.toFixed(2)} ms`);
  console.log(`Average Latency       : ${avg.toFixed(2)} ms`);
  console.log(`Median (p50) Latency  : ${p50.toFixed(2)} ms`);
  console.log(`p90 Latency           : ${p90.toFixed(2)} ms`);
  console.log(`p95 Latency           : ${p95.toFixed(2)} ms  <-- Target: < 300 ms`);
  console.log(`p99 Latency           : ${p99.toFixed(2)} ms`);
  console.log(`Max Latency           : ${max.toFixed(2)} ms`);
  console.log('----------------------------------------------------');

  const budgetPass = p95 < 300;
  if (budgetPass) {
    console.log(
      `\n✅ PERFORMANCE BUDGET PASSED: p95 of ${p95.toFixed(2)} ms is well below the 300 ms threshold!\n`,
    );
  } else {
    console.error(
      `\n❌ PERFORMANCE BUDGET FAILED: p95 of ${p95.toFixed(2)} ms exceeded the 300 ms threshold!\n`,
    );
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});

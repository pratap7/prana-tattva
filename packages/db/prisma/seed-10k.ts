import {
  PrismaClient,
  UserRole,
  UserStatus,
  VerificationTier,
  ApprovalStatus,
  ServiceMode,
  Weekday,
} from '@prisma/client';

const prisma = new PrismaClient();

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

const CATEGORY_TEMPLATES = [
  { name: 'Yoga & Pranayama', slug: 'yoga', requiresLicense: false },
  { name: 'Vedic Astrology', slug: 'astrology', requiresLicense: false },
  { name: 'Reiki Healing', slug: 'reiki', requiresLicense: false },
  { name: 'Psychotherapy & Counseling', slug: 'psychotherapy', requiresLicense: true },
  { name: 'Sound & Vibration Healing', slug: 'sound-healing', requiresLicense: false },
  { name: 'Pranic Healing & Biofield', slug: 'pranic-healing', requiresLicense: false },
  { name: 'Ayurvedic Wellness & Dinacharya', slug: 'ayurveda', requiresLicense: false },
  { name: 'Meditation & Mindfulness', slug: 'meditation', requiresLicense: false },
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

async function main() {
  console.log('--- Project Nirvana: 10,000 Provider Dataset Seeder ---');
  const targetCount = 10000;
  const batchSize = 500;

  // 1. Ensure categories exist
  console.log('Ensuring taxonomy categories exist...');
  const categoryMap = new Map<string, string>();
  for (const cat of CATEGORY_TEMPLATES) {
    const existing = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, requiresLicense: cat.requiresLicense },
      create: {
        name: cat.name,
        slug: cat.slug,
        requiresLicense: cat.requiresLicense,
        commissionBps: 1500,
      },
    });
    categoryMap.set(cat.slug, existing.id);
  }
  const categoryIds = Array.from(categoryMap.values());

  console.log(`Generating ${targetCount} providers in batches of ${batchSize}...`);
  const startTime = Date.now();

  for (let batch = 0; batch < targetCount / batchSize; batch++) {
    const batchStart = batch * batchSize;
    const usersData = [];
    const profilesData = [];

    for (let i = 0; i < batchSize; i++) {
      const idx = batchStart + i;
      const firstName = FIRST_NAMES[idx % FIRST_NAMES.length] || 'Practitioner';
      const lastName =
        LAST_NAMES[Math.floor(idx / FIRST_NAMES.length) % LAST_NAMES.length] || 'Shastri';
      const displayName = `${firstName} ${lastName}`;
      const slug = `${firstName.toLowerCase()}-${lastName.toLowerCase()}-${idx}`;
      const city = CITIES[idx % CITIES.length] || 'Rishikesh';
      const catTemplate =
        CATEGORY_TEMPLATES[idx % CATEGORY_TEMPLATES.length] || CATEGORY_TEMPLATES[0]!;
      const userId = `user-10k-${idx}`;
      const profileId = `prof-10k-${idx}`;

      const ratingCount = Math.floor(Math.random() * 300);
      const ratingAvg = (4.0 + Math.random() * 1.0).toFixed(2);
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

      usersData.push({
        id: userId,
        email: `provider.${idx}@nirvana-benchmark.test`,
        role: UserRole.PROVIDER,
        status: UserStatus.ACTIVE,
        timeZone: 'Asia/Kolkata',
      });

      profilesData.push({
        id: profileId,
        userId,
        displayName,
        slug,
        headline: `Certified Practitioner in ${catTemplate.name}`,
        bio: `Holistic practitioner with over ${5 + (idx % 20)} years of dedicated spiritual and wellness practice in ${city}.`,
        city,
        country: 'IN',
        languages: idx % 2 === 0 ? ['en', 'hi'] : ['en', 'hi', 'sa'],
        yearsExperience: 5 + (idx % 25),
        verificationTier,
        approvalStatus: ApprovalStatus.APPROVED,
        ratingAvg: parseFloat(ratingAvg),
        ratingCount,
        completedSessions,
        responseRate,
        bufferMinutes: 15,
        minNoticeHours: 4,
      });
    }

    // Insert users and profiles
    await prisma.user.createMany({ data: usersData, skipDuplicates: true });
    await prisma.providerProfile.createMany({ data: profilesData, skipDuplicates: true });

    // Insert provider categories and services for this batch
    const providerCategoriesData = [];
    const servicesData = [];
    const rulesData = [];

    for (let i = 0; i < batchSize; i++) {
      const idx = batchStart + i;
      const profileId = `prof-10k-${idx}`;
      const categoryId = categoryIds[idx % categoryIds.length] || categoryIds[0] || 'cat-yoga';
      const catTemplate =
        CATEGORY_TEMPLATES[idx % CATEGORY_TEMPLATES.length] || CATEGORY_TEMPLATES[0]!;
      const weekday: Weekday = WEEKDAYS_LIST[idx % WEEKDAYS_LIST.length] || 'MONDAY';

      providerCategoriesData.push({
        providerId: profileId,
        categoryId,
        isPrimary: true,
      });

      const mode: ServiceMode = idx % 3 === 0 ? 'ONLINE' : idx % 3 === 1 ? 'IN_PERSON' : 'BOTH';
      const priceAmount = (1000 + (idx % 40) * 100) * 100; // ₹1,000 to ₹5,000

      servicesData.push({
        id: `svc-10k-${idx}`,
        providerId: profileId,
        categoryId,
        title: `1:1 Classical ${catTemplate.name} Session`,
        description: `Comprehensive consultation tailored to individual constitutional needs.`,
        durationMin: 60,
        priceAmount,
        currency: 'INR',
        mode,
        isActive: true,
      });

      // Add weekday rule
      rulesData.push({
        id: `rule-10k-${idx}`,
        providerId: profileId,
        weekday,
        startTime: '09:00',
        endTime: '17:00',
        providerTimeZone: 'Asia/Kolkata',
        isActive: true,
      });
    }

    await prisma.providerCategory.createMany({
      data: providerCategoriesData,
      skipDuplicates: true,
    });
    await prisma.service.createMany({ data: servicesData, skipDuplicates: true });
    await prisma.availabilityRule.createMany({ data: rulesData, skipDuplicates: true });

    if ((batch + 1) % 4 === 0 || batch === targetCount / batchSize - 1) {
      console.log(`Progress: ${(batch + 1) * batchSize} / ${targetCount} providers created...`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `Successfully seeded ${targetCount} providers with full catalogs in ${durationSec}s!`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

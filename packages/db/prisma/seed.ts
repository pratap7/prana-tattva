import {
  PrismaClient,
  UserRole,
  UserStatus,
  VerificationTier,
  ApprovalStatus,
  CredentialType,
  CredentialStatus,
  ServiceMode,
  CancellationPolicy,
  Weekday,
  BookingStatus,
  PaymentGateway,
  PaymentStatus,
  LedgerEntryType,
  LedgerAccountType,
  ConsentType,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive Project Nirvana seed...');

  // 1. Clean existing records in referential order
  await prisma.ledgerEntry.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.review.deleteMany();
  await prisma.session.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.report.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.availabilityException.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.service.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.providerCategory.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Cleaned existing tables.');

  // 2. Create All 8 Core Categories & Subcategories
  const categoriesData = [
    {
      name: 'Yoga & Yogic Sciences',
      slug: 'yoga',
      description: 'Traditional Hatha, Vinyasa, Pranayama, and Ashtanga somatic practices.',
      requiresLicense: false,
      commissionBps: 1500, // 15.00%
      subcategories: ['Hatha Yoga', 'Ashtanga Vinyasa', 'Kriya Yoga', 'Pranayama & Breath'],
    },
    {
      name: 'Reiki & Energy Alignment',
      slug: 'reiki-healing',
      description: 'Subtle biofield balancing, chakra realignment, and distance Usui healing.',
      requiresLicense: false,
      commissionBps: 1500,
      subcategories: ['Usui Reiki', 'Kundalini Reiki', 'Distance Reiki', 'Aura Cleansing'],
    },
    {
      name: 'Psychotherapy & Counseling',
      slug: 'psychotherapy',
      description:
        'Confidential clinical psychological therapy, CBT, and somatic emotional processing.',
      requiresLicense: true, // Requires verified clinical license
      commissionBps: 1200, // 12.00%
      subcategories: [
        'Cognitive Behavioral (CBT)',
        'Mindfulness-Based Stress',
        'Somatic Psychotherapy',
        'Trauma Integration',
      ],
    },
    {
      name: 'Pranic Healing',
      slug: 'pranic-healing',
      description:
        'No-touch energy cleansing using natural prana to accelerate physical and mental vitality.',
      requiresLicense: false,
      commissionBps: 1500,
      subcategories: ['Chakra Cleansing', 'Pranic Psychotherapy', 'Crystal Pranic Healing'],
    },
    {
      name: 'Vedic Astrology & Jyotish',
      slug: 'astrology',
      description:
        'Authentic Kundli horoscope readings, planetary transit insights, and karmic guidance.',
      requiresLicense: false,
      commissionBps: 1800, // 18.00%
      subcategories: [
        'Birth Chart Analysis',
        'Planetary Transits',
        'Muhurta Timing',
        'Career & Relationship Karma',
      ],
    },
    {
      name: 'Spiritual Mentorship',
      slug: 'spirituality',
      description:
        'Introspective philosophy, Advaita Vedanta, shadow work, and conscious awakening.',
      requiresLicense: false,
      commissionBps: 1500,
      subcategories: [
        'Vedanta Inquiry',
        'Inner Awakening',
        'Shadow Work',
        'Spiritual Life Navigation',
      ],
    },
    {
      name: 'Sound & Frequency Healing',
      slug: 'sound-healing',
      description:
        'Acoustic vibrational medicine utilizing Tibetan singing bowls and binaural frequencies.',
      requiresLicense: false,
      commissionBps: 1500,
      subcategories: ['Tibetan Singing Bowls', 'Binaural Frequency Therapy', 'Gong Sound Bath'],
    },
    {
      name: 'Meditation & Breathwork',
      slug: 'meditation',
      description: 'Guided Vipassana, Yoga Nidra, and neuro-somatic breath regulation.',
      requiresLicense: false,
      commissionBps: 1500,
      subcategories: [
        'Vipassana Meditation',
        'Yoga Nidra',
        'Holotropic Breathwork',
        'Stress Dissolution',
      ],
    },
  ];

  const categoryMap: Record<string, string> = {};

  for (const cat of categoriesData) {
    const createdCat = await prisma.category.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        requiresLicense: cat.requiresLicense,
        commissionBps: cat.commissionBps,
        subcategories: {
          create: cat.subcategories.map((subName) => ({
            name: subName,
            slug: subName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, ''),
          })),
        },
      },
    });
    categoryMap[cat.slug] = createdCat.id;
  }
  console.log('✅ Created 8 categories and subcategories.');

  // 3. Create Admin User
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@projectnirvana.internal',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      timeZone: 'Asia/Kolkata',
      emailVerifiedAt: new Date(),
    },
  });

  // 4. Create 5 Verified Providers with Profiles, Categories, Credentials, Services, Availability
  const providersData = [
    {
      email: 'maya.devi@projectnirvana.internal',
      displayName: 'Acharya Maya Devi',
      slug: 'maya-devi',
      headline: 'Certified Pranic Master & Traditional Hatha Yogi (14+ yrs exp)',
      bio: 'Initiated into classical Hatha Sadhana in the Himalayas and certified in Advanced Pranic Psychotherapy. I facilitate deep somatic decompression and energetic cleansing.',
      city: 'Rishikesh',
      country: 'IN',
      languages: ['en', 'hi', 'sa'],
      yearsExperience: 14,
      verificationTier: VerificationTier.BACKGROUND_CHECKED,
      categorySlugs: ['yoga', 'pranic-healing'],
      credentials: [
        {
          type: CredentialType.CERTIFICATION,
          title: 'Master Pranic Healer & Instructor',
          issuer: 'World Pranic Healing Foundation',
          documentUrl: 'credentials/maya-pranic-master.pdf',
        },
        {
          type: CredentialType.LICENSE,
          title: 'E-RYT 500 Experienced Registered Yoga Teacher',
          issuer: 'Yoga Alliance USA',
          documentUrl: 'credentials/maya-eryt500.pdf',
        },
      ],
      services: [
        {
          categorySlug: 'pranic-healing',
          title: 'Chakra Decongestion & Aura Revitalization',
          description:
            'Non-touch energy body scan, removal of stagnant diseased energies, and pranic infusion for total balance.',
          durationMin: 60,
          priceAmount: 280000, // INR 2,800.00
          mode: ServiceMode.ONLINE,
        },
        {
          categorySlug: 'yoga',
          title: '1-on-1 Prana Vidya & Hatha Alignment',
          description:
            'Personalized posture geometry, bandhas, and breath regulation to stabilize the autonomic nervous system.',
          durationMin: 75,
          priceAmount: 320000, // INR 3,200.00
          mode: ServiceMode.ONLINE,
        },
      ],
      availabilityDays: [
        Weekday.MONDAY,
        Weekday.TUESDAY,
        Weekday.WEDNESDAY,
        Weekday.THURSDAY,
        Weekday.FRIDAY,
      ],
      startTime: '08:00',
      endTime: '13:00',
    },
    {
      email: 'dr.vikram.sen@projectnirvana.internal',
      displayName: 'Dr. Vikram Sen, Ph.D.',
      slug: 'dr-vikram-sen',
      headline: 'Licensed Clinical Psychologist & Somatic Trauma Specialist',
      bio: '12 years of clinical practice integrating CBT, mindfulness-based cognitive therapy, and somatic experiencing to treat anxiety, burn-out, and developmental trauma.',
      city: 'Bengaluru',
      country: 'IN',
      languages: ['en', 'hi', 'kn'],
      yearsExperience: 12,
      verificationTier: VerificationTier.CREDENTIAL_VERIFIED,
      categorySlugs: ['psychotherapy', 'meditation'],
      credentials: [
        {
          type: CredentialType.DEGREE,
          title: 'Doctor of Philosophy (Ph.D.) in Clinical Psychology',
          issuer: 'NIMHANS Bengaluru',
          documentUrl: 'credentials/vikram-phd-nimhans.pdf',
        },
        {
          type: CredentialType.LICENSE,
          title: 'Registered Clinical Psychologist License',
          issuer: 'Rehabilitation Council of India (RCI)',
          documentUrl: 'credentials/vikram-rci-license.pdf',
        },
      ],
      services: [
        {
          categorySlug: 'psychotherapy',
          title: 'Individual Psychotherapy & Emotional Grounding',
          description:
            'Confidential clinical session for processing acute anxiety, stress, or interpersonal distress.',
          durationMin: 50,
          priceAmount: 400000, // INR 4,000.00
          mode: ServiceMode.ONLINE,
        },
      ],
      availabilityDays: [
        Weekday.TUESDAY,
        Weekday.WEDNESDAY,
        Weekday.THURSDAY,
        Weekday.FRIDAY,
        Weekday.SATURDAY,
      ],
      startTime: '10:00',
      endTime: '17:00',
    },
    {
      email: 'anand.sharma@projectnirvana.internal',
      displayName: 'Pandit Anand Sharma',
      slug: 'anand-sharma-jyotish',
      headline: 'Vedic Astrologer & Parashari Jyotish Vidwan (20+ yrs exp)',
      bio: 'Descendant of a traditional Kashi lineage. Offering lucid, ethical horoscope readings focused on dharma, karma mitigation, and auspicious life timing.',
      city: 'Varanasi',
      country: 'IN',
      languages: ['en', 'hi'],
      yearsExperience: 22,
      verificationTier: VerificationTier.ID_VERIFIED,
      categorySlugs: ['astrology', 'spirituality'],
      credentials: [
        {
          type: CredentialType.CERTIFICATION,
          title: 'Jyotish Visharada',
          issuer: 'Indian Council of Astrological Sciences (ICAS)',
          documentUrl: 'credentials/anand-jyotish-visharada.pdf',
        },
      ],
      services: [
        {
          categorySlug: 'astrology',
          title: 'Comprehensive Janam Kundli & Dasha Consultation',
          description:
            'Detailed analysis of birth chart, planetary transits, and tailored gemstone/mantra remedies.',
          durationMin: 60,
          priceAmount: 350000, // INR 3,500.00
          mode: ServiceMode.ONLINE,
        },
      ],
      availabilityDays: [Weekday.MONDAY, Weekday.TUESDAY, Weekday.WEDNESDAY, Weekday.THURSDAY],
      startTime: '11:00',
      endTime: '18:00',
    },
    {
      email: 'sunita.rao@projectnirvana.internal',
      displayName: 'Sunita Rao',
      slug: 'sunita-rao-sound',
      headline: 'Sound Alchemist & Usui Reiki Grandmaster',
      bio: 'Combining hand-hammered antique Himalayan singing bowls with 528Hz frequency medicine and Reiki energetic touch to induce restorative theta brainwave states.',
      city: 'Pune',
      country: 'IN',
      languages: ['en', 'mr', 'hi'],
      yearsExperience: 9,
      verificationTier: VerificationTier.CREDENTIAL_VERIFIED,
      categorySlugs: ['sound-healing', 'reiki-healing'],
      credentials: [
        {
          type: CredentialType.CERTIFICATION,
          title: 'Sound Therapy Master Practitioner',
          issuer: 'Sound Healing Academy UK',
          documentUrl: 'credentials/sunita-sound-cert.pdf',
        },
      ],
      services: [
        {
          categorySlug: 'sound-healing',
          title: 'Vibrational Singing Bowl Sound Bath',
          description:
            'Acoustic frequency transmission designed for nervous system reset and cellular peace.',
          durationMin: 60,
          priceAmount: 250000, // INR 2,500.00
          mode: ServiceMode.ONLINE,
        },
      ],
      availabilityDays: [
        Weekday.WEDNESDAY,
        Weekday.THURSDAY,
        Weekday.FRIDAY,
        Weekday.SATURDAY,
        Weekday.SUNDAY,
      ],
      startTime: '09:00',
      endTime: '15:00',
    },
    {
      email: 'liam.oconnor@projectnirvana.internal',
      displayName: 'Liam O’Connor',
      slug: 'liam-breathwork',
      headline: 'Somatic Breathwork Facilitator & Mindfulness Mentor',
      bio: 'Guiding seekers through conscious connected breathing and neurodynamic regulation to release stored somatic tension and deepen meditative insight.',
      city: 'Goa',
      country: 'IN',
      languages: ['en'],
      yearsExperience: 8,
      verificationTier: VerificationTier.ID_VERIFIED,
      categorySlugs: ['meditation', 'spirituality'],
      credentials: [
        {
          type: CredentialType.CERTIFICATION,
          title: 'Certified Somatic Breathwork Practitioner',
          issuer: 'Global Breathwork Association',
          documentUrl: 'credentials/liam-breathwork.pdf',
        },
      ],
      services: [
        {
          categorySlug: 'meditation',
          title: 'Conscious Connected Breathwork Journey',
          description:
            'A powerful 90-minute breathwork session for emotional catharsis, clarity, and deep presence.',
          durationMin: 90,
          priceAmount: 380000, // INR 3,800.00
          mode: ServiceMode.ONLINE,
        },
      ],
      availabilityDays: [Weekday.MONDAY, Weekday.WEDNESDAY, Weekday.FRIDAY],
      startTime: '07:00',
      endTime: '12:00',
    },
  ];

  const createdProviders: {
    profileId: string;
    userId: string;
    services: { id: string; price: number; categoryId: string }[];
  }[] = [];

  for (const prov of providersData) {
    const user = await prisma.user.create({
      data: {
        email: prov.email,
        role: UserRole.PROVIDER,
        status: UserStatus.ACTIVE,
        timeZone: 'Asia/Kolkata',
        emailVerifiedAt: new Date(),
        providerProfile: {
          create: {
            displayName: prov.displayName,
            slug: prov.slug,
            headline: prov.headline,
            bio: prov.bio,
            city: prov.city,
            country: prov.country,
            languages: prov.languages,
            yearsExperience: prov.yearsExperience,
            verificationTier: prov.verificationTier,
            approvalStatus: ApprovalStatus.APPROVED,
            ratingAvg: 4.95,
            ratingCount: 12,
            bufferMinutes: 15,
            categories: {
              create: prov.categorySlugs.map((slug, idx) => ({
                categoryId: categoryMap[slug]!,
                isPrimary: idx === 0,
              })),
            },
            credentials: {
              create: prov.credentials.map((cred) => ({
                type: cred.type,
                title: cred.title,
                issuer: cred.issuer,
                documentUrl: cred.documentUrl,
                status: CredentialStatus.VERIFIED,
                reviewedBy: adminUser.id,
                reviewedAt: new Date(),
              })),
            },
            availabilityRules: {
              create: prov.availabilityDays.map((weekday) => ({
                weekday,
                startTime: prov.startTime,
                endTime: prov.endTime,
                providerTimeZone: 'Asia/Kolkata',
                isActive: true,
              })),
            },
          },
        },
      },
      include: {
        providerProfile: true,
      },
    });

    const profileId = user.providerProfile!.id;
    const createdServicesList: { id: string; price: number; categoryId: string }[] = [];

    for (const svc of prov.services) {
      const createdService = await prisma.service.create({
        data: {
          providerId: profileId,
          categoryId: categoryMap[svc.categorySlug]!,
          title: svc.title,
          description: svc.description,
          durationMin: svc.durationMin,
          priceAmount: svc.priceAmount,
          currency: 'INR',
          mode: svc.mode,
          isActive: true,
          cancellationPolicy: CancellationPolicy.MODERATE,
        },
      });
      createdServicesList.push({
        id: createdService.id,
        price: createdService.priceAmount,
        categoryId: createdService.categoryId,
      });
    }

    createdProviders.push({
      profileId,
      userId: user.id,
      services: createdServicesList,
    });
  }
  console.log(
    `✅ Created 5 verified providers with credentials, availability rules, and services.`,
  );

  // 5. Create 10 Consumers
  const consumersData = [
    { email: 'arjun.kapoor@example.com', timeZone: 'Asia/Kolkata' },
    { email: 'priya.nair@example.com', timeZone: 'Asia/Kolkata' },
    { email: 'david.miller@example.com', timeZone: 'America/New_York' },
    { email: 'ananya.deshmukh@example.com', timeZone: 'Asia/Kolkata' },
    { email: 'elena.rostova@example.com', timeZone: 'Europe/London' },
    { email: 'kavita.patel@example.com', timeZone: 'Asia/Kolkata' },
    { email: 'marcus.chen@example.com', timeZone: 'America/Los_Angeles' },
    { email: 'sneha.reddy@example.com', timeZone: 'Asia/Kolkata' },
    { email: 'tariq.mansoor@example.com', timeZone: 'Asia/Dubai' },
    { email: 'zara.ali@example.com', timeZone: 'Asia/Kolkata' },
  ];

  const createdConsumers: string[] = [];

  for (const c of consumersData) {
    const user = await prisma.user.create({
      data: {
        email: c.email,
        role: UserRole.CONSUMER,
        status: UserStatus.ACTIVE,
        timeZone: c.timeZone,
        emailVerifiedAt: new Date(),
        consentRecords: {
          create: [
            {
              consentType: ConsentType.TERMS_OF_SERVICE,
              version: '1.0',
            },
            {
              consentType: ConsentType.PRIVACY_POLICY,
              version: '1.0',
            },
            {
              consentType: ConsentType.HEALTH_DATA_CONSENT,
              version: '1.0',
            },
          ],
        },
      },
    });
    createdConsumers.push(user.id);
  }
  console.log(`✅ Created 10 consumers with accepted consent records.`);

  // 6. Create Completed Bookings, Payments, Sessions, LedgerEntries, Reviews
  const p1 = createdProviders[0]!; // Maya Devi
  const c1 = createdConsumers[0]!; // Arjun
  const c2 = createdConsumers[1]!; // Priya
  const s1 = p1.services[0]!; // Chakra Cleansing (280000 paise)

  const completedStartAt = new Date(Date.now() - 5 * 24 * 3600 * 1000); // 5 days ago
  const completedEndAt = new Date(completedStartAt.getTime() + 60 * 60 * 1000);

  const booking1 = await prisma.booking.create({
    data: {
      consumerId: c1,
      providerId: p1.userId,
      serviceId: s1.id,
      startAt: completedStartAt,
      endAt: completedEndAt,
      status: BookingStatus.COMPLETED,
      priceSnapshot: s1.price,
      currency: 'INR',
      commissionBps: 1500, // 15%
      notes: 'Experiencing severe throat and solar plexus congestion due to chronic work stress.',
      payments: {
        create: {
          gateway: PaymentGateway.RAZORPAY,
          gatewayOrderId: 'order_test_completed_001',
          gatewayPaymentId: 'pay_test_completed_001',
          amount: s1.price,
          currency: 'INR',
          status: PaymentStatus.CAPTURED,
        },
      },
      session: {
        create: {
          videoRoomName: 'nirvana-room-completed-001',
          startedAt: completedStartAt,
          endedAt: completedEndAt,
          joinedByConsumerAt: new Date(completedStartAt.getTime() + 60 * 1000),
          joinedByProviderAt: completedStartAt,
        },
      },
      review: {
        create: {
          consumerId: c1,
          providerId: p1.userId,
          rating: 5,
          comment:
            'Maya Devi is truly gifted. After 60 minutes of pranic decongestion, a months-long weight lifted off my chest.',
          providerReply:
            'Blessings to your journey, Arjun. Maintain your daily breathwork sadhana.',
          isPublished: true,
        },
      },
    },
  });

  // Financial Ledger Entries for Booking 1 (Double-entry)
  const platformFee = Math.round((s1.price * 1500) / 10000); // 15% = 42,000 paise
  const providerPayout = s1.price - platformFee; // 238,000 paise

  await prisma.ledgerEntry.createMany({
    data: [
      {
        bookingId: booking1.id,
        entryType: LedgerEntryType.DEBIT,
        accountType: LedgerAccountType.CONSUMER_PAYMENT,
        amount: s1.price,
        description: 'Payment collected from consumer for booking',
      },
      {
        bookingId: booking1.id,
        entryType: LedgerEntryType.CREDIT,
        accountType: LedgerAccountType.PLATFORM_ESCROW,
        amount: s1.price,
        description: 'Funds held in escrow pending session completion',
      },
      {
        bookingId: booking1.id,
        entryType: LedgerEntryType.CREDIT,
        accountType: LedgerAccountType.PLATFORM_REVENUE,
        amount: platformFee,
        description: 'Platform commission 15% recognized on session completion',
      },
      {
        bookingId: booking1.id,
        entryType: LedgerEntryType.CREDIT,
        accountType: LedgerAccountType.PROVIDER_PAYABLE,
        amount: providerPayout,
        description: 'Provider earnings released upon session completion',
      },
    ],
  });

  // 7. Create Upcoming Confirmed Booking (Tomorrow)
  const tomorrowStart = new Date(Date.now() + 24 * 3600 * 1000);
  tomorrowStart.setUTCHours(9, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 60 * 60 * 1000);

  await prisma.booking.create({
    data: {
      consumerId: c2,
      providerId: p1.userId,
      serviceId: s1.id,
      startAt: tomorrowStart,
      endAt: tomorrowEnd,
      status: BookingStatus.CONFIRMED,
      priceSnapshot: s1.price,
      currency: 'INR',
      commissionBps: 1500,
      notes: 'Initial session for chronic fatigue.',
      payments: {
        create: {
          gateway: PaymentGateway.RAZORPAY,
          gatewayOrderId: 'order_test_confirmed_002',
          gatewayPaymentId: 'pay_test_confirmed_002',
          amount: s1.price,
          currency: 'INR',
          status: PaymentStatus.CAPTURED,
        },
      },
      session: {
        create: {
          videoRoomName: 'nirvana-room-upcoming-002',
        },
      },
    },
  });

  // 8. Create Sample Conversation and Encrypted Messages
  const conversation = await prisma.conversation.create({
    data: {
      bookingId: booking1.id,
      consumerId: c1,
      providerId: p1.userId,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: c1,
      ciphertext: 'U2FsdGVkX1+vupppZksvRf5pq5g5XjFR5Z0==', // Simulated encrypted payload
      iv: 'd3f8a4e12c0b49f6',
      authTag: '7c9e8b1a2f4d6e0a',
      isEncrypted: true,
    },
  });

  console.log(
    `✅ Created sample bookings, sessions, reviews, ledger entries, and encrypted messages.`,
  );
  console.log('🎉 Project Nirvana database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

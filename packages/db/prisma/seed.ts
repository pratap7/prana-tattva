import { PrismaClient, UserRole, ServiceCategory, SessionFormat } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Project Nirvana database seeding...');

  // 1. Clean existing records (for development)
  await prisma.review.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Admin
  const admin = await prisma.user.create({
    data: {
      email: 'admin@projectnirvana.internal',
      name: 'Nirvana Ops',
      role: UserRole.ADMIN,
      timeZone: 'Asia/Kolkata',
    },
  });

  // 3. Create Sample Provider
  const provider = await prisma.user.create({
    data: {
      email: 'maya.healer@projectnirvana.internal',
      name: 'Maya Devi',
      role: UserRole.PROVIDER,
      timeZone: 'Asia/Kolkata',
      providerProfile: {
        create: {
          headline: 'Certified Pranic Healer & Yoga Acharya (12+ yrs exp)',
          bio: 'Guiding seekers through energetic alignment, traditional hatha yoga, and inner awakening.',
          isVerified: true,
          commissionPercent: 15,
        },
      },
    },
    include: {
      providerProfile: true,
    },
  });

  if (!provider.providerProfile) {
    throw new Error('Provider profile failed to create');
  }

  // 4. Create Services
  await prisma.service.createMany({
    data: [
      {
        providerId: provider.providerProfile.id,
        title: 'Chakra Balancing & Pranic Cleansing',
        description:
          'Deep energy body scan and pranic aura decongestion to restore vitality and mental clarity.',
        category: ServiceCategory.PRANIC_HEALING,
        format: SessionFormat.VIDEO,
        durationMinutes: 60,
        priceInPaise: 250000, // INR 2,500.00
        currency: 'INR',
        isActive: true,
      },
      {
        providerId: provider.providerProfile.id,
        title: 'Mindful Breathwork & Hatha Sadhana',
        description:
          '1-on-1 personalized yogic posture correction and pranayama for stress dissolution.',
        category: ServiceCategory.YOGA,
        format: SessionFormat.VIDEO,
        durationMinutes: 75,
        priceInPaise: 300000, // INR 3,000.00
        currency: 'INR',
        isActive: true,
      },
    ],
  });

  // 5. Create Sample Consumer
  const consumer = await prisma.user.create({
    data: {
      email: 'rohit.seeker@projectnirvana.internal',
      name: 'Rohit Sharma',
      role: UserRole.CONSUMER,
      timeZone: 'Asia/Kolkata',
    },
  });

  console.log(`✅ Seeded successfully:`);
  console.log(`   Admin: ${admin.email}`);
  console.log(`   Provider: ${provider.email} (Profile ID: ${provider.providerProfile.id})`);
  console.log(`   Consumer: ${consumer.email}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * This script seeds the database with essential data for testing.
 * - 1 Admin user
 * - 1 Active, subscribed User
 * - 1 Subscription Plan
 * - 1 Gemini API Key for the rotator
 */
async function main() {
  console.log('Start seeding ...');

  // 1. Clear existing data (optional, but good for clean tests)
  // Order matters due to foreign keys!
  await prisma.apiUsageLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.userSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.geminiApiKey.deleteMany();
  console.log('Cleared existing data.');

  // 2. Create an Admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.admin.create({
    data: {
      name: 'Admin User',
      username: 'admin',
      email: 'admin@test.com',
      password: adminPassword,
      role: 'admin',
    },
  });
  console.log(`Created admin user: ${admin.email}`);

  // 3. Create a Subscription Plan
  const testPlan = await prisma.subscriptionPlan.create({
    data: {
      name: 'Test Plan',
      planProviderId: 'test_plan_monthly',
      priceCents: 1000,
      billingCycle: 'monthly',
      requestLimitMonthly: 500,
      rateLimitPerMinute: 20,
      isPublic: true,
    },
  });
  console.log(`Created subscription plan: ${testPlan.name}`);

  // 4. Create an active User
  const userPassword = await bcrypt.hash('user123', 10);
  const user = await prisma.user.create({
    data: {
      name: 'Test User',
      username: 'testuser',
      email: 'user@test.com',
      password: userPassword,
      accountStatus: 'active', // Must be 'active' to log in
    },
  });
  console.log(`Created user: ${user.email}`);

  // 5. Create an active Subscription for the User
  const periodStart = new Date();
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30); // 30-day subscription

  const subscription = await prisma.userSubscription.create({
    data: {
      status: 'active', // Must be 'active' for API auth
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      userId: user.id,
      planId: testPlan.id,
    },
  });
  console.log(`Created active subscription for ${user.email}`);

  // 6. Link subscription to user as their 'current' one
  await prisma.user.update({
    where: { id: user.id },
    data: { currentSubscriptionId: subscription.id },
  });
  console.log('Linked subscription to user.');

  // 7. Create a Gemini API Key for the rotator
  const geminiKey = await prisma.geminiApiKey.create({
    data: {
      key: 'DUMMY_GEMINI_API_KEY_12345', // This is a fake key
      isRateLimited: false,
    },
  });
  console.log(`Created dummy Gemini API key: ${geminiKey.key.substring(0, 10)}...`);

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
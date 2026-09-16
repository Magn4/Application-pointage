import { PrismaClient, TenantStatus, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const password = process.env.DEMO_PASSWORD ?? 'Password123!';
const FUTURA_SLUG = 'futura-expertise';
const FUTURA_EMAIL = 'contact@futura-expert.com';
const HR_EMAIL = 'a.elyoussefi@futura-expert.com';

async function main() {
  // Free deployment bootstrap must never reset passwords or delete existing data.
  const bootstrapOnly = process.env.DEMO_BOOTSTRAP_ONLY === 'true';
  if (bootstrapOnly) {
    if (await prisma.tenant.count() || await prisma.user.count()) {
      console.log('Demo bootstrap skipped: database already initialized. Existing passwords unchanged.');
      return;
    }
    if (!process.env.DEMO_PASSWORD || password.length < 12) {
      throw new Error('Set DEMO_PASSWORD to at least 12 characters before bootstrapping the demo.');
    }
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const enterprise = await prisma.subscriptionPlan.upsert({
    where: { name: 'Enterprise' },
    update: {
      maxUsers: 5000,
      maxSites: 1000,
      priceMonthly: 499,
      features: ['Multi-sites avance', 'SLA', 'API', 'Exports paie'],
    },
    create: {
      name: 'Enterprise',
      maxUsers: 5000,
      maxSites: 1000,
      priceMonthly: 499,
      features: ['Multi-sites avance', 'SLA', 'API', 'Exports paie'],
    },
  });

  const futura = await prisma.tenant.upsert({
    where: { slug: FUTURA_SLUG },
    update: {
      name: 'Futura Expertise',
      email: FUTURA_EMAIL,
      city: 'Casablanca',
      country: 'Maroc',
      status: TenantStatus.ACTIVE,
      subscriptionPlanId: enterprise.id,
      deletedAt: null,
    },
    create: {
      name: 'Futura Expertise',
      slug: FUTURA_SLUG,
      email: FUTURA_EMAIL,
      city: 'Casablanca',
      country: 'Maroc',
      status: TenantStatus.ACTIVE,
      subscriptionPlanId: enterprise.id,
    },
  });

  const tenantsToDelete = await prisma.tenant.findMany({
    where: { slug: { not: FUTURA_SLUG } },
    select: { id: true, name: true, slug: true },
  });

  const deleteResult = bootstrapOnly ? { count: 0 } : await prisma.tenant.deleteMany({
    where: { slug: { not: FUTURA_SLUG } },
  });

  const hr = await prisma.user.upsert({
    where: { email: HR_EMAIL },
    update: {
      tenantId: futura.id,
      passwordHash,
      firstName: 'Abdelouahed',
      lastName: 'El Youssefi',
      role: UserRole.HR,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      tenantId: futura.id,
      email: HR_EMAIL,
      passwordHash,
      firstName: 'Abdelouahed',
      lastName: 'El Youssefi',
      role: UserRole.HR,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.employeeProfile.upsert({
    where: { userId: hr.id },
    update: {
      tenantId: futura.id,
      employeeNumber: 'FE-RH-001',
      jobTitle: 'Responsable RH',
      contractType: 'CDI',
      hireDate: new Date('2026-01-01'),
      status: 'ACTIVE',
    },
    create: {
      tenantId: futura.id,
      userId: hr.id,
      employeeNumber: 'FE-RH-001',
      jobTitle: 'Responsable RH',
      contractType: 'CDI',
      hireDate: new Date('2026-01-01'),
      annualLeaveBalance: 18,
      status: 'ACTIVE',
    },
  });

  const defaultLeaveTypes = [
    {
      code: 'MAR-AL',
      name: '[MAR] Congé annuel',
      annualAllowanceDays: 18,
      isPaid: true,
      requiresApproval: true,
    },
    {
      code: 'MAR-SL',
      name: '[MAR] Congé maladie',
      annualAllowanceDays: 6,
      isPaid: true,
      requiresApproval: true,
    },
    {
      code: 'MAR-MR',
      name: '[MAR] Congé de mariage',
      annualAllowanceDays: 4,
      isPaid: true,
      requiresApproval: true,
    },
  ];

  for (const leaveType of defaultLeaveTypes) {
    await prisma.leaveType.upsert({
      where: {
        tenantId_code: {
          tenantId: futura.id,
          code: leaveType.code,
        },
      },
      update: {
        name: leaveType.name,
        annualAllowanceDays: leaveType.annualAllowanceDays,
        isPaid: leaveType.isPaid,
        requiresApproval: leaveType.requiresApproval,
        status: 'ACTIVE',
      },
      create: {
        tenantId: futura.id,
        ...leaveType,
        status: 'ACTIVE',
      },
    });
  }

  await prisma.tenantSettings.upsert({
    where: { tenantId: futura.id },
    update: {},
    create: { tenantId: futura.id },
  });

  const tenantsLeft = await prisma.tenant.findMany({
    select: { name: true, slug: true, status: true, _count: { select: { users: true, sites: true, projects: true } } },
    orderBy: { name: 'asc' },
  });

  console.log(
    JSON.stringify(
      {
        keptTenant: futura.slug,
        deletedTenants: tenantsToDelete,
        deletedTenantCount: deleteResult.count,
        hr: hr.email,
        tenantsLeft,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

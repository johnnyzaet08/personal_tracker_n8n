import { createPrismaClient } from '../src/client';

const LOCAL_TENANT_ID = process.env.LOCAL_TENANT_ID;
const LOCAL_USER_ID = process.env.LOCAL_USER_ID;

async function main(): Promise<void> {
  if (process.env.LOCAL_AUTH_ENABLED !== 'true') {
    console.log('Development seed skipped because LOCAL_AUTH_ENABLED is not true.');
    return;
  }
  if (!LOCAL_TENANT_ID || !LOCAL_USER_ID) {
    throw new Error('LOCAL_TENANT_ID and LOCAL_USER_ID are required for the development seed');
  }

  const prisma = createPrismaClient();
  try {
    await prisma.tenant.upsert({
      where: { id: LOCAL_TENANT_ID },
      create: {
        id: LOCAL_TENANT_ID,
        slug: 'local-personal',
        name: 'Espacio personal local',
        timezone: process.env.TZ ?? 'America/Costa_Rica',
        defaultCurrency: 'CRC',
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: LOCAL_USER_ID },
      create: {
        id: LOCAL_USER_ID,
        email: 'local.user@tracker.invalid',
        name: 'Usuario local',
      },
      update: {},
    });
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: LOCAL_TENANT_ID, userId: LOCAL_USER_ID } },
      create: { tenantId: LOCAL_TENANT_ID, userId: LOCAL_USER_ID, role: 'owner' },
      update: {},
    });
    await prisma.integration.upsert({
      where: {
        tenantId_provider_type: {
          tenantId: LOCAL_TENANT_ID,
          provider: 'gmail',
          type: 'email',
        },
      },
      create: {
        tenantId: LOCAL_TENANT_ID,
        provider: 'gmail',
        type: 'email',
        status: 'pending',
        metadata: { configurationRequired: 'GMAIL_OAUTH_CREDENTIAL_REQUIRED' },
      },
      update: {
        status: 'pending',
        metadata: { configurationRequired: 'GMAIL_OAUTH_CREDENTIAL_REQUIRED' },
      },
    });
    console.log('Development tenant, user, membership, and pending Gmail integration are ready.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed failure';
  console.error(message);
  process.exitCode = 1;
});

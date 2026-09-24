import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { provisionSuperAdmin } from '../src/provisioning/provision-admin';

const ENV_WITH_SECRETS = ['PROVISION_ADMIN_LOGIN_ID', 'PROVISION_ADMIN_PASSWORD'] as const;

async function main(): Promise<void> {
  const missing = ENV_WITH_SECRETS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}. Set them before running this provisioning command.`,
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to provision a SUPER_ADMIN');
    process.exitCode = 1;
    return;
  }

  const loginId = process.env.PROVISION_ADMIN_LOGIN_ID as string;
  const password = process.env.PROVISION_ADMIN_PASSWORD as string;
  const name = process.env.PROVISION_ADMIN_NAME?.trim() || 'Super Admin';

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const result = await provisionSuperAdmin(
      { loginId, password, name },
      {
        findUserByLoginId: (id) =>
          prisma.user.findUnique({
            where: { loginId: id },
            select: { id: true, role: true, status: true },
          }),
        createUser: (input) =>
          prisma.user.create({
            data: {
              loginId: input.loginId,
              name: input.name,
              passwordHash: input.passwordHash,
              role: input.role,
              status: input.status,
            },
            select: { id: true },
          }),
      },
    );

    switch (result.outcome) {
      case 'created':
        console.log(`SUPER_ADMIN provisioned (user id=${result.userId})`);
        break;
      case 'already_active_super_admin':
        console.log(
          `SUPER_ADMIN already exists and is active (user id=${result.userId}); no changes made`,
        );
        break;
      case 'refused':
        console.error(`Refused: ${result.reason}`);
        process.exitCode = 1;
        break;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();

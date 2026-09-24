import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { provisionBranch } from '../src/provisioning/provision-branch';

const REQUIRED_ENV = [
  'BRANCH_CODE',
  'BRANCH_NAME',
  'BRANCH_CITY',
  'BRANCH_STATE',
  'BRANCH_COUNTRY',
  'BRANCH_DELIVERY_RADIUS_KM',
] as const;

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  return Number(raw);
}

async function main(): Promise<void> {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}. Set them before running this provisioning command.`,
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to provision a branch');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const result = await provisionBranch(
      {
        code: (process.env.BRANCH_CODE as string).trim(),
        name: (process.env.BRANCH_NAME as string).trim(),
        city: (process.env.BRANCH_CITY as string).trim(),
        state: (process.env.BRANCH_STATE as string).trim(),
        country: (process.env.BRANCH_COUNTRY as string).trim(),
        address: process.env.BRANCH_ADDRESS,
        latitude: parseOptionalNumber(process.env.BRANCH_LATITUDE),
        longitude: parseOptionalNumber(process.env.BRANCH_LONGITUDE),
        deliveryRadiusKm: Number(process.env.BRANCH_DELIVERY_RADIUS_KM),
      },
      {
        findBranchByCode: (code) =>
          prisma.branch.findUnique({
            where: { code },
            select: { id: true },
          }),
        createBranch: (input) =>
          prisma.branch.create({
            data: {
              code: input.code,
              name: input.name,
              city: input.city,
              state: input.state,
              country: input.country,
              address: input.address,
              latitude: input.latitude,
              longitude: input.longitude,
              deliveryRadiusKm: input.deliveryRadiusKm,
              status: input.status,
            },
            select: { id: true },
          }),
      },
    );

    switch (result.outcome) {
      case 'created':
        console.log(`Branch provisioned (id=${result.branchId})`);
        break;
      case 'already_exists':
        console.log(`Branch already exists (id=${result.branchId}); no changes made`);
        break;
      case 'invalid':
        console.error(`Refused: ${result.reason}`);
        process.exitCode = 1;
        break;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();

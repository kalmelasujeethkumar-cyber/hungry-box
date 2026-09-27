import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { findGunturBranchId, liveLogin, liveSuffix } from './live-test-helpers';

const RUN_LIVE_E2E = process.env.RUN_LIVE_E2E === '1';
const DB_AVAILABLE = Boolean(process.env.DATABASE_URL);

async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

/**
 * D1 and D2 were both invisible to the type checker because the invalid
 * `Order.userId` projection is only rejected by the real query engine, and the
 * unit tests mocked Prisma so the field was never validated. These assertions
 * run the exact projections used in production against real Postgres.
 *
 * The fixture order is written directly with Prisma rather than through the
 * checkout HTTP flow, so this spec does not contend for the seeded customer's
 * cart or address with the other live specs.
 */
describe.skipIf(!RUN_LIVE_E2E || !DB_AVAILABLE)('live order projections (Postgres)', () => {
  it('resolves the announcement and ownership projections used in production', async () => {
    const app = await createTestApp();
    const db = app.get(PrismaService).requireClient();
    const orderIds: string[] = [];
    const userIds: string[] = [];
    try {
      const admin = await liveLogin(app, 'admin@gmail.com', '456456');
      const branchId = await findGunturBranchId(app, admin.token);
      const suffix = liveSuffix().slice(0, 10);

      const owner = await db.user.create({
        data: {
          loginId: `e2e-proj-owner-${suffix}@example.test`,
          passwordHash: 'not-used',
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      const outsider = await db.user.create({
        data: {
          loginId: `e2e-proj-outsider-${suffix}@example.test`,
          passwordHash: 'not-used',
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      userIds.push(owner.id, outsider.id);

      const order = await db.order.create({
        data: {
          orderNumber: `HB-PROJ-${suffix.toUpperCase()}`,
          customerId: owner.id,
          branchId,
          subtotalMinor: 10000,
          discountMinor: 0,
          deliveryFeeMinor: 0,
          taxMinor: 0,
          totalMinor: 10000,
        },
        select: { id: true, orderNumber: true, customerId: true },
      });
      orderIds.push(order.id);

      // The exact shape DeliveryAssignmentService.announce() relies on.
      const row = await db.order.findFirst({
        where: { id: order.id },
        select: { orderNumber: true, customerId: true },
      });
      expect(row).not.toBeNull();
      expect(row!.customerId).toBe(owner.id);

      // The tracking ownership predicate must scope by that same column.
      const owned = await db.order.findFirst({
        where: { id: order.id, customerId: owner.id },
        select: { id: true },
      });
      expect(owned).not.toBeNull();

      const notOwned = await db.order.findFirst({
        where: { id: order.id, customerId: outsider.id },
        select: { id: true },
      });
      expect(notOwned).toBeNull();

      // A genuinely absent order is indistinguishable from a non-owned one,
      // which is what lets the service answer both with the same 404.
      const absent = await db.order.findFirst({
        where: { id: '00000000-0000-0000-0000-000000000000', customerId: outsider.id },
        select: { id: true },
      });
      expect(absent).toBeNull();
    } finally {
      for (const id of orderIds) {
        await db.order.delete({ where: { id } }).catch(() => null);
      }
      for (const id of userIds) {
        await db.user.delete({ where: { id } }).catch(() => null);
      }
      await app.close();
    }
  }, 90000);

  it('rejects the invalid Order.userId projection that the fix removed', async () => {
    const app = await createTestApp();
    const db = app.get(PrismaService).requireClient();
    try {
      // Documents why the original defect passed both typecheck and the mocked
      // unit tests: only the real query engine rejects it.
      await expect(
        db.order.findFirst({
          where: { id: '00000000-0000-0000-0000-000000000000' },
          select: { orderNumber: true, userId: true } as Record<string, boolean>,
        }),
      ).rejects.toThrow();
    } finally {
      await app.close();
    }
  }, 60000);
});

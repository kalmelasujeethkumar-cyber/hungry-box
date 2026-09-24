import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSync } from '@node-rs/argon2';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  advanceToReadyForPickup,
  bearer,
  buildPaidOrder,
  createPartnerUserAndProfile,
  deletePartnerUserAndProfile,
  findGunturBranchId,
  liveLogin,
  liveSuffix,
} from './live-test-helpers';

const RUN_LIVE_E2E = process.env.RUN_LIVE_E2E === '1';
const DB_AVAILABLE = Boolean(process.env.DATABASE_URL);

async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

describe.skipIf(!RUN_LIVE_E2E || !DB_AVAILABLE)('live branch isolation (Postgres)', () => {
  it('keeps a guntur manager away from a foreign branch and its partners', async () => {
    const app = await createTestApp();
    const server = app.getHttpServer();
    const prisma = app.get(PrismaService);
    const db = prisma.requireClient();
    const stamp = liveSuffix();

    let foreignBranchId: string | null = null;
    let foreignPartner: { userId: string; profileId: string } | null = null;
    let testCustomerId: string | null = null;
    let addressId: string | null = null;

    try {
      const admin = await liveLogin(app, 'admin@gmail.com', '456456');
      const manager = await liveLogin(app, 'branch1@gmail.com', '654654');
      const gunturBranchId = await findGunturBranchId(app, admin.token);

      const foreignBranch = await db.branch.create({
        data: {
          code: `e2ebr-${stamp}`,
          name: 'E2E Foreign Branch',
          city: 'Hyderabad',
          state: 'Telangana',
          country: 'India',
          latitude: 17.385,
          longitude: 78.4867,
          deliveryRadiusKm: 5,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      foreignBranchId = foreignBranch.id;

      foreignPartner = await createPartnerUserAndProfile(app, {
        branchId: foreignBranch.id,
        loginId: `e2e-live-p-${stamp}`,
        fullName: 'Foreign Partner',
      });

      const partners = (
        await request(server).get('/api/branch/partners').set(bearer(manager.token)).expect(200)
      ).body as Array<{ id: string }>;
      expect(partners.some((row) => row.id === foreignPartner!.profileId)).toBe(false);

      const candidates = (
        await request(server)
          .get('/api/branch/partners/candidates')
          .set(bearer(manager.token))
          .expect(200)
      ).body as Array<{ id: string }>;
      expect(candidates.some((row) => row.id === foreignPartner!.profileId)).toBe(false);

      const foreignDetail = await request(server)
        .get(`/api/branch/partners/${foreignPartner.profileId}`)
        .set(bearer(manager.token))
        .expect(404);
      expect(foreignDetail.body.message).toBe('Partner not found');

      const customerUser = await db.user.create({
        data: {
          loginId: `e2e-live-c-${stamp}`,
          passwordHash: hashSync('Pass-Isolation-1'),
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      testCustomerId = customerUser.id;

      const customer = await liveLogin(app, `e2e-live-c-${stamp}`, 'Pass-Isolation-1');

      const order = await buildPaidOrder(app, customer.token, gunturBranchId);
      addressId = order.addressId;
      await advanceToReadyForPickup(app, manager.token, order.orderId);

      const ineligible = await request(server)
        .post(`/api/branch/orders/${order.orderId}/assign`)
        .set(bearer(manager.token))
        .send({ deliveryPartnerId: foreignPartner.profileId })
        .expect(409);
      expect(ineligible.body.code).toBe('delivery.partner_ineligible');

      const cancelled = await request(server)
        .post(`/api/branch/orders/${order.orderId}/cancel`)
        .set(bearer(manager.token))
        .send({ reason: 'Phase 8 branch isolation live test' })
        .expect(201);
      expect(cancelled.body.status).toBe('CANCELLED');
    } finally {
      if (addressId && testCustomerId) {
        const customer = await liveLogin(app, `e2e-live-c-${stamp}`, 'Pass-Isolation-1').catch(
          () => null,
        );
        if (customer) {
          await request(server)
            .delete(`/api/addresses/${addressId}`)
            .set(bearer(customer.token))
            .expect(200);
        }
      }
      if (foreignPartner) {
        await deletePartnerUserAndProfile(app, foreignPartner).catch(() => undefined);
      }
      if (foreignBranchId) {
        await db.branch.delete({ where: { id: foreignBranchId } }).catch(() => undefined);
      }
      await app.close();
    }
  }, 90000);
});

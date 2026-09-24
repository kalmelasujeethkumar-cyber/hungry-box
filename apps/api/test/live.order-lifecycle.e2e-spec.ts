import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  advanceToReadyForPickup,
  bearer,
  buildPaidOrder,
  findGunturBranchId,
  liveLogin,
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

describe.skipIf(!RUN_LIVE_E2E || !DB_AVAILABLE)('live order lifecycle (Postgres)', () => {
  it('drives customer payment -> manager confirmation -> partner delivery -> audit/analytics', async () => {
    const app = await createTestApp();
    const server = app.getHttpServer();
    let addressId: string | null = null;
    try {
      const customer = await liveLogin(app, 'customer@gmail.com', '20252025');
      const manager = await liveLogin(app, 'branch1@gmail.com', '654654');
      const partner = await liveLogin(app, 'shiva@', '789789');
      const admin = await liveLogin(app, 'admin@gmail.com', '456456');

      const branchId = await findGunturBranchId(app, admin.token);
      const order = await buildPaidOrder(app, customer.token, branchId);
      addressId = order.addressId;

      await advanceToReadyForPickup(app, manager.token, order.orderId);

      const partners = (
        await request(server).get('/api/branch/partners').set(bearer(manager.token)).expect(200)
      ).body as Array<{
        id: string;
        partnerId: string;
        status: string;
        availability: string;
      }>;
      const seedPartner = partners.find(
        (row) => row.status === 'ACTIVE' && row.partnerId.startsWith('HB-DP-'),
      );
      expect(seedPartner).toBeTruthy();

      const assignment = (
        await request(server)
          .post(`/api/branch/orders/${order.orderId}/assign`)
          .set(bearer(manager.token))
          .send({
            deliveryPartnerId: seedPartner!.id,
            notes: 'Phase 8 live lifecycle delivery',
          })
          .expect(201)
      ).body as { id: string; status: string };
      expect(assignment.status).toBe('ASSIGNED');

      const partnerAction = async (action: string, expected: string): Promise<void> => {
        const res = await request(server)
          .post(`/api/delivery/assignments/${assignment.id}/${action}`)
          .set(bearer(partner.token))
          .expect(201);
        expect(res.body.status).toBe(expected);
      };
      await partnerAction('accept', 'ACCEPTED');
      await partnerAction('pickup', 'PICKED_UP');
      await partnerAction('out-for-delivery', 'OUT_FOR_DELIVERY');
      await partnerAction('deliver', 'DELIVERED');

      const tracking = (
        await request(server)
          .get(`/api/orders/${order.orderId}/delivery-tracking`)
          .set(bearer(customer.token))
          .expect(200)
      ).body as {
        orderId: string;
        orderStatus: string;
        trackingAvailable: boolean;
        assignment: { status: string } | null;
        partner: { fullName: string } | null;
      };
      expect(tracking.orderId).toBe(order.orderId);
      expect(tracking.orderStatus).toBe('DELIVERED');
      expect(tracking.assignment?.status).toBe('DELIVERED');
      expect(tracking.partner?.fullName).toBeTruthy();
      expect(tracking.trackingAvailable).toBe(false);

      const detail = (
        await request(server)
          .get(`/api/branch/orders/${order.orderId}`)
          .set(bearer(manager.token))
          .expect(200)
      ).body as { status: string };
      expect(detail.status).toBe('DELIVERED');

      const audit = (
        await request(server)
          .get(`/api/branch/audit?entityType=delivery_assignment&branchId=${branchId}&limit=100`)
          .set(bearer(admin.token))
          .expect(200)
      ).body as { items: Array<{ entityId: string | null; kind: string }> };
      const kinds = audit.items
        .filter((row) => row.entityId === assignment.id)
        .map((row) => row.kind);
      expect(kinds).toContain('DELIVERY_ASSIGNED');
      expect(kinds).toContain('DELIVERY_ACCEPTED');
      expect(kinds).toContain('DELIVERY_PICKED_UP');
      expect(kinds).toContain('DELIVERY_OUT_FOR_DELIVERY');
      expect(kinds).toContain('DELIVERY_COMPLETED');

      const dashboard = (
        await request(server)
          .get(`/api/admin/dashboard?branchId=${branchId}`)
          .set(bearer(admin.token))
          .expect(200)
      ).body as { delivery: { delivered: number } };
      expect(dashboard.delivery.delivered).toBeGreaterThanOrEqual(1);
    } finally {
      if (addressId) {
        const customer = await liveLogin(app, 'customer@gmail.com', '20252025').catch(() => null);
        if (customer) {
          await request(server)
            .delete(`/api/addresses/${addressId}`)
            .set(bearer(customer.token))
            .expect(200);
        }
      }
      await app.close();
    }
  }, 90000);
});

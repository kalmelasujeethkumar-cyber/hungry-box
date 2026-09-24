import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  bearer,
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

describe.skipIf(!RUN_LIVE_E2E || !DB_AVAILABLE)('live suspended partner (Postgres)', () => {
  it('blocks an already-issued JWT once the partner profile is suspended', async () => {
    const app = await createTestApp();
    const server = app.getHttpServer();
    const stamp = liveSuffix();

    let owned: { userId: string; profileId: string; password: string } | null = null;
    try {
      const admin = await liveLogin(app, 'admin@gmail.com', '456456');
      const branchId = await findGunturBranchId(app, admin.token);

      owned = await createPartnerUserAndProfile(app, {
        branchId,
        loginId: `e2e-live-s-${stamp}`,
        fullName: 'E2E Suspension Partner',
      });

      const partner = await liveLogin(app, `e2e-live-s-${stamp}`, owned.password);

      const before = (
        await request(server).get('/api/delivery/profile').set(bearer(partner.token)).expect(200)
      ).body as { status: string; id: string };
      expect(before.status).toBe('ACTIVE');
      expect(before.id).toBe(owned.profileId);

      const suspended = (
        await request(server)
          .post(`/api/branch/partners/${owned.profileId}/status`)
          .set(bearer(admin.token))
          .send({ status: 'SUSPENDED' })
          .expect(201)
      ).body as { status: string };
      expect(suspended.status).toBe('SUSPENDED');

      await request(server).get('/api/delivery/profile').set(bearer(partner.token)).expect(403);

      await request(server)
        .post('/api/delivery/availability')
        .set(bearer(partner.token))
        .send({ availability: 'ONLINE' })
        .expect(403);

      await request(server)
        .post('/api/delivery/location')
        .set(bearer(partner.token))
        .send({ latitude: 16.3015, longitude: 80.4405 })
        .expect(403);

      const audit = (
        await request(server)
          .get(
            `/api/branch/audit?entityType=delivery_partner_profile&branchId=${branchId}&limit=100`,
          )
          .set(bearer(admin.token))
          .expect(200)
      ).body as { items: Array<{ entityId: string | null; kind: string; message: string | null }> };
      const statusChanged = audit.items.filter(
        (row) => row.entityId === owned!.profileId && row.kind === 'PARTNER_STATUS_CHANGED',
      );
      expect(statusChanged.length).toBeGreaterThanOrEqual(1);
      expect(statusChanged.some((row) => row.message?.includes('SUSPENDED'))).toBe(true);
    } finally {
      if (owned) {
        await deletePartnerUserAndProfile(app, owned).catch(() => undefined);
      }
      await app.close();
    }
  }, 60000);
});

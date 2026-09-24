import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

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

// Requires a running Postgres with the seed applied. Opt in explicitly so this
// suite never touches a real database accidentally.
describe.skipIf(!RUN_LIVE_E2E || !DB_AVAILABLE)('live auth + catalog flow (Postgres)', () => {
  it('logs in, reads the profile, and lists the guntur catalog', async () => {
    const app = await createTestApp();
    const server = app.getHttpServer();

    const login = await request(server)
      .post('/api/auth/login')
      .send({ loginId: 'branch1@gmail.com', password: '654654' })
      .expect(200);

    const { accessToken, user } = login.body as {
      accessToken: string;
      user: { id: string; role: string; branchId: string };
    };
    expect(accessToken).toBeTruthy();
    expect(user.role).toBe('BRANCH_MANAGER');
    expect(user.branchId).toBeTruthy();

    const me = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ id: user.id, role: 'BRANCH_MANAGER' });

    const branches = await request(server)
      .get('/api/branches')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const guntur = ((branches.body as Array<{ code: string; id: string }>) ?? []).find(
      (branch) => branch.code === 'guntur',
    );
    expect(guntur).toBeTruthy();

    const catalog = await request(server)
      .get(`/api/catalog/products?branchId=${guntur!.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const products = catalog.body as Array<{ productId: string; effectivePriceMinor: number }>;
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].effectivePriceMinor).toBeGreaterThan(0);

    const rejected = await request(server)
      .post('/api/auth/login')
      .send({ loginId: 'branch1@gmail.com', password: 'wrong-password' })
      .expect(401);
    expect(rejected.body.message).toBe('Invalid credentials');

    await app.close();
  });
});

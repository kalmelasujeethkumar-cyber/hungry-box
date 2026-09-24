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
describe.skipIf(!RUN_LIVE_E2E || !DB_AVAILABLE)('live customer flow (Postgres)', () => {
  it('drives addresses, serviceability and per-branch carts end to end', async () => {
    const app = await createTestApp();
    const server = app.getHttpServer();

    const login = await request(server)
      .post('/api/auth/login')
      .send({ loginId: 'customer@gmail.com', password: '20252025' })
      .expect(200);
    const token = login.body.accessToken as string;
    const customerId = login.body.user.id as string;
    expect(token).toBeTruthy();
    expect(login.body.user.role).toBe('CUSTOMER');

    const auth = `Bearer ${token}`;
    const guntur = (
      (await request(server).get('/api/branches').set('Authorization', auth).expect(200))
        .body as Array<{ code: string; id: string }>
    ).find((branch) => branch.code === 'guntur');
    expect(guntur).toBeTruthy();

    await request(server).get('/api/cart?branchId=nope').set('Authorization', auth).expect(400);

    const unauthenticatedCart = await request(server)
      .get(`/api/cart?branchId=${guntur!.id}`)
      .expect(401);
    expect(unauthenticatedCart.body.message).toBe('Authentication required');

    const address = await request(server)
      .post('/api/addresses')
      .set('Authorization', auth)
      .send({
        label: 'WORK',
        recipientName: 'Demo Customer',
        houseFlat: '4-20',
        streetArea: 'Arundelpet',
        city: 'Guntur',
        state: 'Andhra Pradesh',
        postalCode: '522002',
        latitude: 16.32,
        longitude: 80.44,
      })
      .expect(201);
    expect(address.body.isDefault).toBe(true);

    const list = await request(server).get('/api/addresses').set('Authorization', auth).expect(200);
    expect((list.body as unknown[]).length).toBeGreaterThanOrEqual(1);

    const updated = await request(server)
      .patch(`/api/addresses/${address.body.id}`)
      .set('Authorization', auth)
      .send({ label: 'HOME' })
      .expect(200);
    expect(updated.body.label).toBe('HOME');

    await request(server)
      .patch(`/api/addresses/${address.body.id}/default`)
      .set('Authorization', auth)
      .expect(200);

    const foreignAddress = await request(server)
      .get('/api/addresses/does-not-exist')
      .set('Authorization', auth)
      .expect(404);
    expect(foreignAddress.body.message).toBe('Address not found');

    const inside = await request(server)
      .post('/api/locations/serviceability')
      .set('Authorization', auth)
      .send({ latitude: 16.26, longitude: 80.43 })
      .expect(201);
    expect(inside.body.serviceable).toBe(true);
    expect(inside.body.branch.code).toBe('guntur');

    const outside = await request(server)
      .post('/api/locations/serviceability')
      .set('Authorization', auth)
      .send({ latitude: 16.4, longitude: 80.43 })
      .expect(201);
    expect(outside.body.serviceable).toBe(false);
    expect(outside.body.branch).toBeNull();

    const emptyCart = await request(server)
      .get(`/api/cart?branchId=${guntur!.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(emptyCart.body.items).toEqual([]);

    const product = (
      (
        await request(server)
          .get(`/api/catalog/products?branchId=${guntur!.id}`)
          .set('Authorization', auth)
          .expect(200)
      ).body as Array<{ productId: string; effectivePriceMinor: number }>
    )[0];
    expect(product.effectivePriceMinor).toBeGreaterThan(0);

    await request(server)
      .post('/api/cart/items')
      .set('Authorization', auth)
      .send({ branchId: guntur!.id, productId: product.productId, quantity: 2, priceMinor: 1 })
      .expect(400);

    const added = await request(server)
      .post('/api/cart/items')
      .set('Authorization', auth)
      .send({ branchId: guntur!.id, productId: product.productId, quantity: 2 })
      .expect(201);

    expect(added.body.items).toHaveLength(1);
    expect(added.body.items[0].quantity).toBe(2);
    const itemId = added.body.items[0].id as string;
    expect(added.body.subtotalMinor).toBe(added.body.items[0].lineSubtotalMinor);

    const refreshed = await request(server)
      .patch(`/api/cart/items/${itemId}`)
      .set('Authorization', auth)
      .send({ quantity: 5 })
      .expect(200);
    expect(refreshed.body.items[0].quantity).toBe(5);
    expect(refreshed.body.itemCount).toBe(5);

    const removed = await request(server)
      .delete(`/api/cart/items/${itemId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(removed.body.items).toEqual([]);

    await request(server)
      .post('/api/cart/items')
      .set('Authorization', auth)
      .send({ branchId: guntur!.id, productId: product.productId, quantity: 1 })
      .expect(201);
    const cleared = await request(server)
      .delete(`/api/cart?branchId=${guntur!.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(cleared.body.items).toEqual([]);
    expect(cleared.body.itemCount).toBe(0);

    await request(server)
      .delete(`/api/addresses/${address.body.id}`)
      .set('Authorization', auth)
      .expect(200);

    expect(customerId).toBeTruthy();
    await app.close();
  }, 30000);
});

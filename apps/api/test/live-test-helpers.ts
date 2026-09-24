import type { INestApplication } from '@nestjs/common';
import { hashSync } from '@node-rs/argon2';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';

export interface LiveLogin {
  token: string;
  userId: string;
  role: string;
}

export async function liveLogin(
  app: INestApplication,
  loginId: string,
  password: string,
): Promise<LiveLogin> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ loginId, password })
    .expect(200);
  return {
    token: res.body.accessToken as string,
    userId: res.body.user.id as string,
    role: res.body.user.role as string,
  };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Unique, collision-safe suffix for tables with unique constraints. */
export function liveSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function findGunturBranchId(app: INestApplication, token: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .get('/api/branches')
    .set(bearer(token))
    .expect(200);
  const guntur = (res.body as Array<{ id: string; code: string }>).find(
    (branch) => branch.code === 'guntur',
  );
  if (!guntur) {
    throw new Error('Seeded guntur branch not found');
  }
  return guntur.id;
}

/**
 * Drives the full customer checkout: address, cart, payment intent, dev
 * provider simulation, and order creation. The created address is left behind
 * because the OrderAddress snapshot and immutable audit history reference the
 * flow; callers may delete it with DELETE /api/addresses/:id when they are done.
 */
export async function buildPaidOrder(
  app: INestApplication,
  token: string,
  branchId: string,
): Promise<{ orderId: string; orderNumber: string; addressId: string }> {
  const server = app.getHttpServer();
  const stamp = liveSuffix();

  const address = await request(server)
    .post('/api/addresses')
    .set(bearer(token))
    .send({
      label: 'WORK',
      recipientName: 'Live E2E Customer',
      houseFlat: `E2E-${stamp}`,
      streetArea: 'Live Test Lane',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522002',
      latitude: 16.3015,
      longitude: 80.4405,
    })
    .expect(201);

  await request(server).delete(`/api/cart?branchId=${branchId}`).set(bearer(token)).expect(200);

  const products = (
    await request(server)
      .get(`/api/catalog/products?branchId=${branchId}`)
      .set(bearer(token))
      .expect(200)
  ).body as Array<{ productId: string; effectivePriceMinor: number }>;
  const product = products[0];
  if (!product || product.effectivePriceMinor <= 0) {
    throw new Error('No purchasable product in the seeded guntur catalog');
  }

  await request(server)
    .post('/api/cart/items')
    .set(bearer(token))
    .send({ branchId, productId: product.productId, quantity: 1 })
    .expect(201);

  const intent = (
    await request(server)
      .post('/api/checkout/payment-intent')
      .set(bearer(token))
      .send({ addressId: address.body.id, method: 'UPI' })
      .expect(201)
  ).body as { paymentId: string; providerPaymentId: string };

  await request(server)
    .post('/api/payments/dev/simulate')
    .set(bearer(token))
    .send({ providerPaymentId: intent.providerPaymentId, outcome: 'success' })
    .expect(201);

  const order = (
    await request(server)
      .post('/api/orders')
      .set(bearer(token))
      .send({
        paymentId: intent.paymentId,
        idempotencyKey: `live-e2e-${stamp}`,
        addressId: address.body.id,
      })
      .expect(201)
  ).body as { id: string; orderNumber: string; status: string };

  if (order.status !== 'PLACED') {
    throw new Error(`Expected a PLACED order, got ${order.status}`);
  }

  return { orderId: order.id, orderNumber: order.orderNumber, addressId: address.body.id };
}

/** Advances an order PLACED -> CONFIRMED -> PREPARING -> READY_FOR_PICKUP. */
export async function advanceToReadyForPickup(
  app: INestApplication,
  managerToken: string,
  orderId: string,
): Promise<void> {
  for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) {
    await request(app.getHttpServer())
      .post(`/api/branch/orders/${orderId}/status`)
      .set(bearer(managerToken))
      .send({ status })
      .expect(201);
  }
}

/**
 * Creates a user + delivery partner profile directly against the test
 * database so a live spec can exercise a partner it fully owns. Callers are
 * expected to delete the profile and user in a finally block.
 */
export async function createPartnerUserAndProfile(
  app: INestApplication,
  opts: { branchId: string; loginId: string; fullName: string },
): Promise<{ userId: string; profileId: string; partnerId: string; password: string }> {
  const prisma = app.get(PrismaService);
  const db = prisma.requireClient();
  const password = `Pass-${liveSuffix()}`;
  const user = await db.user.create({
    data: {
      loginId: opts.loginId,
      passwordHash: hashSync(password),
      role: 'DELIVERY_PARTNER',
      status: 'ACTIVE',
      branchId: opts.branchId,
    },
    select: { id: true },
  });
  const partnerId = `HB-E2E-${liveSuffix().slice(0, 10).toUpperCase()}`;
  const profile = await db.deliveryPartnerProfile.create({
    data: {
      partnerId,
      userId: user.id,
      branchId: opts.branchId,
      fullName: opts.fullName,
      status: 'ACTIVE',
      availability: 'ONLINE',
    },
    select: { id: true },
  });
  return { userId: user.id, profileId: profile.id, partnerId, password };
}

export async function deletePartnerUserAndProfile(
  app: INestApplication,
  opts: { userId: string; profileId: string },
): Promise<void> {
  const prisma = app.get(PrismaService);
  const db = prisma.requireClient();
  await db.deliveryPartnerProfile.delete({ where: { id: opts.profileId } });
  await db.user.delete({ where: { id: opts.userId } });
}

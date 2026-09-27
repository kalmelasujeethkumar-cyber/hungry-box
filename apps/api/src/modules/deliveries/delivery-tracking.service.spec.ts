import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryTrackingService } from './delivery-tracking.service';

type OrderRow = Record<string, unknown>;

interface FindFirstArgs {
  where: { id: string; customerId: string };
  select: Record<string, boolean>;
}

/**
 * Stands in for the database and applies the ownership predicate, so a lookup
 * for an order the caller does not own resolves to `null` exactly as Postgres
 * would. A mock that ignored the predicate could not prove that ownership is
 * enforced authoritatively in the query rather than in application memory.
 */
function baseDb(rows: OrderRow[]) {
  const db = {
    order: {
      findFirst: vi.fn(async (args: FindFirstArgs) => {
        const match = rows.find(
          (row) => row.id === args.where.id && row.customerId === args.where.customerId,
        );
        return match ?? null;
      }),
    },
  };
  return db;
}

function buildService(rows: OrderRow[]) {
  const db = baseDb(rows);
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const service = new DeliveryTrackingService(prisma);
  return { service, db };
}

function orderSource(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'o1',
    orderNumber: 'HB-20260925-000001',
    status: 'OUT_FOR_DELIVERY',
    customerId: 'cust-1',
    address: { latitude: 16.3067, longitude: 80.4365 },
    deliveryAssignments: [
      {
        id: 'a1',
        status: 'OUT_FOR_DELIVERY',
        assignedAt: new Date('2026-09-25T10:30:00.000Z'),
        acceptedAt: new Date('2026-09-25T10:31:00.000Z'),
        pickedUpAt: new Date('2026-09-25T10:40:00.000Z'),
        outForDeliveryAt: new Date('2026-09-25T10:45:00.000Z'),
        deliveredAt: null,
        deliveryPartner: {
          id: 'p1',
          partnerId: 'HB-DP-000042',
          fullName: 'Shiva Kumar',
          profilePhotoUrl: null,
          mobile: null,
          vehicleType: 'Bike',
          vehicleNumber: 'AP07 1234',
          locations: [
            {
              latitude: 16.31,
              longitude: 80.44,
              accuracy: 10,
              recordedAt: new Date('2026-09-25T10:46:00.000Z'),
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe('DeliveryTrackingService.getTracking', () => {
  it('returns empty tracking when the order has no assignment yet', async () => {
    const { service } = buildService([
      orderSource({ status: 'PREPARING', deliveryAssignments: [] }),
    ]);

    const result = await service.getTracking('cust-1', 'o1');

    expect(result.assignment).toBeNull();
    expect(result.partner).toBeNull();
    expect(result.trackingAvailable).toBe(false);
    expect(result.location).toBeNull();
    expect(result.orderStatus).toBe('PREPARING');
  });

  it('lets the owner read tracking for their own order', async () => {
    const { service } = buildService([orderSource()]);

    const result = await service.getTracking('cust-1', 'o1');

    expect(result.orderId).toBe('o1');
    expect(result.orderStatus).toBe('OUT_FOR_DELIVERY');
    expect(result.assignment?.status).toBe('OUT_FOR_DELIVERY');
  });

  it('scopes the lookup to the requesting customer in the database predicate', async () => {
    const { service, db } = buildService([orderSource()]);

    await service.getTracking('cust-1', 'o1');

    expect(db.order.findFirst).toHaveBeenCalledTimes(1);
    const args = db.order.findFirst.mock.calls[0][0] as unknown as FindFirstArgs;
    expect(args.where).toEqual({ id: 'o1', customerId: 'cust-1' });
  });

  it('never selects the non-existent Order.userId column', async () => {
    const { service, db } = buildService([orderSource()]);

    await service.getTracking('cust-1', 'o1');

    const args = db.order.findFirst.mock.calls[0][0] as unknown as FindFirstArgs;
    expect(Object.keys(args.select)).not.toContain('userId');
  });

  it('does not expose customer or ownership metadata in the response', async () => {
    const { service } = buildService([orderSource()]);

    const result = await service.getTracking('cust-1', 'o1');

    expect(result).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('userId');
    expect(JSON.stringify(result)).not.toContain('cust-1');
  });

  it('returns 404 when a different customer requests the order (IDOR)', async () => {
    const { service } = buildService([orderSource()]);

    await expect(service.getTracking('cust-2', 'o1')).rejects.toThrow(NotFoundException);
  });

  it('answers a non-owned order exactly like one that does not exist', async () => {
    const { service } = buildService([orderSource()]);

    const notOwned = await service
      .getTracking('cust-2', 'o1')
      .then(() => null)
      .catch((error: unknown) => error);
    const { service: missingService } = buildService([]);
    const missing = await missingService
      .getTracking('cust-2', 'o1')
      .then(() => null)
      .catch((error: unknown) => error);

    expect(notOwned).toBeInstanceOf(NotFoundException);
    expect(missing).toBeInstanceOf(NotFoundException);
    expect((notOwned as NotFoundException).getResponse()).toEqual(
      (missing as NotFoundException).getResponse(),
    );
  });

  it('returns 404 when the order does not exist', async () => {
    const { service } = buildService([]);

    await expect(service.getTracking('cust-1', 'o1')).rejects.toThrow(NotFoundException);
  });

  it('exposes partner info and live location while out for delivery', async () => {
    const { service } = buildService([orderSource()]);

    const result = await service.getTracking('cust-1', 'o1');

    expect(result.partner?.fullName).toBe('Shiva Kumar');
    expect(result.partner?.mobile).toBeNull();
    expect(result.location).toEqual(
      expect.objectContaining({ latitude: 16.31, longitude: 80.44, accuracy: 10 }),
    );
    expect(result.distanceToDestinationKm).toEqual(expect.any(Number));
    expect(result.trackingAvailable).toBe(true);
  });

  it('hides the location before the order moves (only visible when picked up / out for delivery)', async () => {
    const { service } = buildService([
      orderSource({
        status: 'READY_FOR_PICKUP',
        deliveryAssignments: [
          {
            id: 'a1',
            status: 'ACCEPTED',
            assignedAt: new Date('2026-09-25T10:30:00.000Z'),
            acceptedAt: new Date('2026-09-25T10:31:00.000Z'),
            pickedUpAt: null,
            outForDeliveryAt: null,
            deliveredAt: null,
            deliveryPartner: {
              id: 'p1',
              partnerId: 'HB-DP-000042',
              fullName: 'Shiva Kumar',
              profilePhotoUrl: null,
              mobile: null,
              vehicleType: 'Bike',
              vehicleNumber: 'AP07 1234',
              locations: [
                {
                  latitude: 16.31,
                  longitude: 80.44,
                  accuracy: 10,
                  recordedAt: new Date('2026-09-25T10:46:00.000Z'),
                },
              ],
            },
          },
        ],
      }),
    ]);

    const result = await service.getTracking('cust-1', 'o1');

    expect(result.assignment?.status).toBe('ACCEPTED');
    expect(result.location).toBeNull();
    expect(result.trackingAvailable).toBe(false);
    expect(result.distanceToDestinationKm).toBeNull();
  });

  it('only exposes a masked or null phone number, never the full partner mobile', async () => {
    const { service } = buildService([orderSource()]);

    const result = await service.getTracking('cust-1', 'o1');
    expect(result.partner?.mobile).toBeNull();
  });
});

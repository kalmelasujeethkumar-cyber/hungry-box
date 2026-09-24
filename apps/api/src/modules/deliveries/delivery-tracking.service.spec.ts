import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryTrackingService } from './delivery-tracking.service';

function baseDb() {
  const db = {
    order: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  return db;
}

function buildService<T extends Record<string, unknown> = ReturnType<typeof baseDb>>() {
  const db = baseDb() as unknown as T;
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const service = new DeliveryTrackingService(prisma);
  return { service, db, prisma };
}

function orderSource(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'o1',
    orderNumber: 'HB-20260925-000001',
    status: 'OUT_FOR_DELIVERY',
    userId: 'cust-1',
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
    const { service, db } = buildService();
    db.order.findFirst.mockResolvedValue({
      id: 'o1',
      orderNumber: 'HB-20260925-000001',
      status: 'PREPARING',
      userId: 'cust-1',
      address: { latitude: 16.3067, longitude: 80.4365 },
      deliveryAssignments: [],
    });

    const result = await service.getTracking('cust-1', 'o1');

    expect(result.assignment).toBeNull();
    expect(result.partner).toBeNull();
    expect(result.trackingAvailable).toBe(false);
    expect(result.location).toBeNull();
    expect(result.orderStatus).toBe('PREPARING');
  });

  it('returns 404 when the order is not owned by the customer', async () => {
    const { service, db } = buildService();
    db.order.findFirst.mockResolvedValue({ ...orderSource(), userId: 'someone-else' });

    await expect(service.getTracking('cust-1', 'o1')).rejects.toThrow(NotFoundException);
  });

  it('returns 404 when the order does not exist', async () => {
    const { service, db } = buildService();
    db.order.findFirst.mockResolvedValue(null);

    await expect(service.getTracking('cust-1', 'o1')).rejects.toThrow(NotFoundException);
  });

  it('exposes partner info and live location while out for delivery', async () => {
    const { service, db } = buildService();
    db.order.findFirst.mockResolvedValue(orderSource());

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
    const { service, db } = buildService();
    db.order.findFirst.mockResolvedValue(
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
    );

    const result = await service.getTracking('cust-1', 'o1');

    expect(result.assignment?.status).toBe('ACCEPTED');
    expect(result.location).toBeNull();
    expect(result.trackingAvailable).toBe(false);
    expect(result.distanceToDestinationKm).toBeNull();
  });

  it('only exposes a masked or null phone number, never the full partner mobile', async () => {
    const { service, db } = buildService();
    db.order.findFirst.mockResolvedValue(orderSource());

    const result = await service.getTracking('cust-1', 'o1');
    expect(result.partner?.mobile).toBeNull();
  });
});

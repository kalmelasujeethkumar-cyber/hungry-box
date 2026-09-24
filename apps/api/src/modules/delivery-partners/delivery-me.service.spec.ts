import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryConflictException } from '../../common/exceptions/delivery-conflict.exception';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryPartnerService } from './delivery-partner.service';
import { DeliveryMeService } from './delivery-me.service';

const BRANCH = { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' };

function profileSource(status: string, availability: string) {
  return {
    id: 'p1',
    partnerId: 'HB-DP-000042',
    userId: 'u1',
    branch: BRANCH,
    fullName: 'Shiva Kumar',
    mobile: '9000000000',
    email: null,
    dateOfBirth: null,
    gender: 'Male',
    emergencyContactName: null,
    emergencyContactPhone: null,
    profilePhotoUrl: null,
    houseFlat: null,
    streetArea: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    identityVerified: false,
    addressProofVerified: false,
    drivingLicenceNumber: null,
    licenceType: null,
    licenceExpiry: null,
    licenceVerified: false,
    vehicleType: 'Bike',
    vehicleNumber: 'AP07 1234',
    vehicleBrand: null,
    vehicleModel: null,
    vehicleColour: null,
    registrationYear: null,
    rcReference: null,
    insuranceReference: null,
    insuranceExpiry: null,
    ownVehicle: null,
    accountHolderName: null,
    bankName: null,
    accountNumberMasked: null,
    ifsc: null,
    payoutVerified: false,
    partnerType: null,
    joinedAt: null,
    status,
    availability,
    wentOnlineAt: null,
    documents: [],
  };
}

function baseDb() {
  const db = {
    deliveryPartnerProfile: {
      findUnique: vi.fn().mockResolvedValue(profileSource('ACTIVE', 'ONLINE')),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: vi.fn().mockResolvedValue(profileSource('ACTIVE', 'ONLINE')),
    },
    deliveryAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    deliveryPartnerLocation: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: ((): unknown => undefined) as unknown,
  };
  db.$transaction = vi
    .fn()
    .mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
  return db;
}

function buildService<T extends Record<string, unknown> = ReturnType<typeof baseDb>>(
  dbOverride?: T,
) {
  const db = (dbOverride ?? baseDb()) as T;
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const partners = {
    activeDeliveryCounts: vi
      .fn()
      .mockResolvedValue(new Map<string, number>([['p1', 0]])),
  } as unknown as DeliveryPartnerService;
  const realtime = {
    emitToUser: vi.fn(),
    emitToBranch: vi.fn(),
  } as unknown as RealtimeGateway;
  const service = new DeliveryMeService(prisma, partners, realtime);
  return { service, db, partners, realtime, prisma };
}

describe('DeliveryMeService.getProfile', () => {
  it('returns the caller profile with active delivery count', async () => {
    const { service, db, partners } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(profileSource('ACTIVE', 'ONLINE'));

    const result = await service.getProfile('u1');

    expect(result.partnerId).toBe('HB-DP-000042');
    expect(partners.activeDeliveryCounts).toHaveBeenCalledWith(['p1']);
    expect(result.activeDeliveryCount).toBe(0);
  });

  it('throws when no profile exists for the user', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(null);

    await expect(service.getProfile('u-nope')).rejects.toThrow(NotFoundException);
  });
});

describe('DeliveryMeService.setAvailability', () => {
  it('puts an active partner online and stamps wentOnlineAt', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', status: 'ACTIVE', availability: 'OFFLINE' },
    );
    db.deliveryPartnerProfile.updateMany.mockResolvedValue({ count: 1 });
    db.deliveryPartnerProfile.findFirstOrThrow.mockResolvedValue(
      profileSource('ACTIVE', 'ONLINE'),
    );

    const result = await service.setAvailability('u1', 'ONLINE');

    expect(db.deliveryPartnerProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ availability: 'ONLINE', wentOnlineAt: expect.any(Date) }),
      }),
    );
    expect(result.availability).toBe('ONLINE');
  });

  it('blocks going online when the partner is not ACTIVE', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', status: 'PENDING_VERIFICATION', availability: 'OFFLINE' },
    );

    await expect(service.setAvailability('u1', 'ONLINE')).rejects.toThrow(
      DeliveryConflictException,
    );
  });

  it('blocks going offline while a delivery is active', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', status: 'ACTIVE', availability: 'ON_DELIVERY' },
    );
    db.deliveryAssignment.findFirst.mockResolvedValue({ id: 'a1' });

    await expect(service.setAvailability('u1', 'OFFLINE')).rejects.toThrow(
      DeliveryConflictException,
    );
  });

  it('goes offline when idle', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', status: 'ACTIVE', availability: 'ONLINE' },
    );
    db.deliveryAssignment.findFirst.mockResolvedValue(null);
    db.deliveryPartnerProfile.update.mockResolvedValue({});
    db.deliveryPartnerProfile.findFirstOrThrow.mockResolvedValue(
      profileSource('ACTIVE', 'OFFLINE'),
    );

    const result = await service.setAvailability('u1', 'OFFLINE');

    expect(db.deliveryPartnerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ availability: 'OFFLINE', wentOfflineAt: expect.any(Date) }),
      }),
    );
    expect(result.availability).toBe('OFFLINE');
  });
});

describe('DeliveryMeService.updateLocation', () => {
  it('rejects location updates while offline', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', availability: 'OFFLINE' },
    );

    await expect(
      service.updateLocation('u1', { latitude: 16.3, longitude: 80.4 }),
    ).rejects.toThrow(DeliveryConflictException);
  });

  it('records the location, updates profile coordinates and returns recordedAt', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', availability: 'ONLINE' },
    );
    db.deliveryAssignment.findFirst.mockResolvedValue(null);
    db.deliveryPartnerLocation.count.mockResolvedValue(3);

    const result = await service.updateLocation('u1', {
      latitude: 16.3067,
      longitude: 80.4365,
      accuracy: 12,
    });

    expect(db.deliveryPartnerLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryPartnerId: 'p1',
          assignmentId: null,
          latitude: 16.3067,
          longitude: 80.4365,
          accuracy: 12,
        }),
      }),
    );
    expect(db.deliveryPartnerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ latitude: 16.3067, longitude: 80.4365 }),
      }),
    );
    expect(result.recordedAt).toEqual(expect.any(String));
  });

  it('emits location updates to the customer and branch when a delivery is active', async () => {
    const { service, db, realtime } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', availability: 'ON_DELIVERY' },
    );
    db.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'a1',
      branchId: 'b1',
      status: 'OUT_FOR_DELIVERY',
      order: { id: 'o1', orderNumber: 'HB-20260925-000001', customerId: 'cust-1' },
    });

    await service.updateLocation('u1', { latitude: 16.31, longitude: 80.44 });

    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'cust-1',
      'delivery.location.updated',
      expect.objectContaining({ type: 'delivery.location.updated', assignmentId: 'a1' }),
    );
    expect(realtime.emitToBranch).toHaveBeenCalledWith(
      'b1',
      'delivery.location.updated',
      expect.anything(),
    );
  });

  it('prunes history beyond the per-partner cap', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', availability: 'ONLINE' },
    );
    db.deliveryAssignment.findFirst.mockResolvedValue(null);
    db.deliveryPartnerLocation.count.mockResolvedValue(501);
    db.deliveryPartnerLocation.findMany.mockResolvedValue([{ id: 'oldest' }]);

    await service.updateLocation('u1', { latitude: 16.3, longitude: 80.4 });

    expect(db.deliveryPartnerLocation.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['oldest'] } }) }),
    );
  });

  it('skips pruning when history is within the cap', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      { id: 'p1', availability: 'ONLINE' },
    );
    db.deliveryAssignment.findFirst.mockResolvedValue(null);
    db.deliveryPartnerLocation.count.mockResolvedValue(50);

    await service.updateLocation('u1', { latitude: 16.3, longitude: 80.4 });

    expect(db.deliveryPartnerLocation.findMany).not.toHaveBeenCalled();
    expect(db.deliveryPartnerLocation.deleteMany).not.toHaveBeenCalled();
  });
});

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryConflictException } from '../../common/exceptions/delivery-conflict.exception';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { DeliveryPartnerService } from './delivery-partner.service';
import { PartnerIdService } from './partner-id.service';

const BRANCH = { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' };

function partnerSource(status = 'PENDING_VERIFICATION', availability = 'OFFLINE') {
  return {
    id: 'p1',
    partnerId: 'HB-DP-000042',
    userId: 'u1',
    branch: BRANCH,
    fullName: 'Shiva Kumar',
    mobile: '9000000000',
    email: null,
    dateOfBirth: null,
    gender: null,
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

function verifiedDocuments() {
  return [
    { id: 'd1', type: 'AADHAAR', documentReference: 'aadhaar-ref', status: 'VERIFIED', verificationNote: null, verifiedAt: new Date() },
    { id: 'd2', type: 'ADDRESS_PROOF', documentReference: 'addr-ref', status: 'VERIFIED', verificationNote: null, verifiedAt: new Date() },
    { id: 'd3', type: 'PAN', documentReference: 'pan-ref', status: 'VERIFIED', verificationNote: null, verifiedAt: new Date() },
    { id: 'd4', type: 'DRIVING_LICENSE', documentReference: 'dl-ref', status: 'VERIFIED', verificationNote: null, verifiedAt: new Date() },
  ];
}

function baseDb() {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'u1' }),
    },
    branch: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 'b1' ? BRANCH : null,
      ),
    },
    deliveryPartnerProfile: {
      findUnique: vi.fn().mockResolvedValue(partnerSource()),
      findFirst: vi.fn().mockResolvedValue(partnerSource()),
      findFirstOrThrow: vi.fn().mockResolvedValue(partnerSource()),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'p1' }),
      update: vi.fn().mockResolvedValue(partnerSource()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    deliveryPartnerDocument: {
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    deliveryAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: ((): unknown => undefined) as unknown,
  };
  db.$transaction = vi
    .fn()
    .mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
  return db;
}

function buildService<T extends Record<string, unknown> = ReturnType<typeof baseDb>>() {
  const db = baseDb() as unknown as T;
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const partnerId = { next: vi.fn().mockResolvedValue('HB-DP-000042') } as unknown as PartnerIdService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new DeliveryPartnerService(prisma, partnerId, audit);
  return { service, db, partnerId, audit, prisma };
}

const manager = { role: 'BRANCH_MANAGER' as const, branchId: 'b1', userId: 'u-mgr' };
const superAdmin = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

describe('DeliveryPartnerService.create', () => {
  it('creates a partner with a sequential id, hashed password and one-time temp password', async () => {
    const { service, db, partnerId, audit } = buildService();
    db.user.findUnique.mockResolvedValue(null);
    const created = {
      ...partnerSource('PENDING_VERIFICATION', 'OFFLINE'),
      branch: BRANCH,
    };
    db.deliveryPartnerProfile.findFirstOrThrow.mockResolvedValue(created);

    const result = await service.create(superAdmin, { fullName: 'Shiva Kumar', loginId: 'shiva@', branchId: 'b1' });

    expect(partnerId.next).toHaveBeenCalled();
    expect(db.deliveryPartnerProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          branchId: 'b1',
          status: 'PENDING_VERIFICATION',
          availability: 'OFFLINE',
          partnerId: 'HB-DP-000042',
        }),
      }),
    );
    expect(result.profile.partnerId).toBe('HB-DP-000042');
    expect(result.profile.status).toBe('PENDING_VERIFICATION');
    expect(result.temporaryPassword).toBeTruthy();
    const createData = db.user.create.mock.calls[0]?.[0] as { data: { passwordHash: string } };
    expect(createData.data.passwordHash).not.toBe(result.temporaryPassword);
    expect(createData.data.passwordHash.length).toBeGreaterThan(0);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PARTNER_CREATED }),
      db,
    );
  });

  it('rejects a duplicate login id', async () => {
    const { service, db } = buildService();
    db.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(superAdmin, { fullName: 'Someone Else', loginId: 'shiva@', branchId: 'b1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('forbids super admin create without a branchId', async () => {
    const { service } = buildService();
    await expect(
      service.create(superAdmin, { fullName: 'Shiva Kumar', loginId: 'shiva@' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('pins a branch manager create to their own branch', async () => {
    const { service, db, partnerId } = buildService();
    db.deliveryPartnerProfile.findFirstOrThrow.mockResolvedValue(partnerSource());
    db.branch.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'b1' ? BRANCH : null,
    );

    const result = await service.create(manager, {
      fullName: 'Local Runner',
      loginId: 'local@',
      branchId: 'b-other',
    });

    expect(partnerId.next).toHaveBeenCalled();
    expect(result.profile.branch.id).toBe('b1');
  });
});

describe('DeliveryPartnerService.list', () => {
  it('scopes a branch manager list to their branch', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findMany.mockResolvedValue([
      {
        id: 'p1',
        partnerId: 'HB-DP-000042',
        fullName: 'Shiva Kumar',
        mobile: '9000000000',
        status: 'ACTIVE',
        availability: 'ONLINE',
        joinedAt: new Date(),
        latitude: null,
        longitude: null,
        branch: BRANCH,
      },
    ]);

    const rows = await service.list(manager, {});

    expect(db.deliveryPartnerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b1' }) }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.partnerId).toBe('HB-DP-000042');
  });

  it('applies search, status, availability and pagination filters for super admin', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findMany.mockResolvedValue([]);

    await service.list(superAdmin, { search: 'shiva', status: 'ACTIVE', availability: 'ONLINE', limit: 10, offset: 5 });

    const call = db.deliveryPartnerProfile.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown>; skip: number; take: number };
    expect(call.skip).toBe(5);
    expect(call.take).toBe(10);
    expect(call.where).toEqual(
      expect.objectContaining({ status: 'ACTIVE', availability: 'ONLINE' }),
    );
  });
});

describe('DeliveryPartnerService.get', () => {
  it('loads a profile from the manager branch and counts active deliveries', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('ACTIVE', 'ONLINE'));
    db.deliveryPartnerProfile.groupBy.mockResolvedValue([]);

    const result = await service.get(manager, 'p1');

    expect(db.deliveryPartnerProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'p1', branchId: 'b1' }) }),
    );
    expect(result.status).toBe('ACTIVE');
    expect(result.activeDeliveryCount).toBe(0);
  });

  it('returns 404 when the profile is not in the manager branch', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(null);

    await expect(service.get(manager, 'p-other')).rejects.toThrow(NotFoundException);
  });
});

describe('DeliveryPartnerService.update', () => {
  it('persists editable profile fields', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('DOCUMENT_REVIEW', 'OFFLINE'));
    db.deliveryPartnerProfile.update.mockResolvedValue(
      { ...partnerSource('DOCUMENT_REVIEW', 'OFFLINE'), mobile: '9888899999' },
    );

    const result = await service.update(manager, 'p1', { mobile: '9888899999', vehicleNumber: 'AP07 9999' });

    expect(db.deliveryPartnerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mobile: '9888899999', vehicleNumber: 'AP07 9999' }),
      }),
    );
    expect(result.mobile).toBe('9888899999');
  });

  it('blocks editing a suspended or rejected partner', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('REJECTED', 'OFFLINE'));

    await expect(service.update(manager, 'p1', { mobile: '9888899999' })).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('DeliveryPartnerService.setAccountStatus', () => {
  it('activates a verified partner', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('VERIFIED', 'OFFLINE'));
    db.deliveryPartnerProfile.update.mockResolvedValue(
      { ...partnerSource('ACTIVE', 'OFFLINE'), joinedAt: new Date() },
    );
    db.deliveryAssignment.groupBy.mockResolvedValue([]);

    const result = await service.setAccountStatus(manager, 'p1', { status: 'ACTIVE' });

    expect(result.status).toBe('ACTIVE');
  });

  it('rejects activation of a partner who is not verified yet', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('PENDING_VERIFICATION', 'OFFLINE'));

    await expect(service.setAccountStatus(manager, 'p1', { status: 'ACTIVE' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('blocks deactivating a partner with an active delivery', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('ACTIVE', 'ON_DELIVERY'));
    db.deliveryAssignment.findFirst.mockResolvedValue({ id: 'a1' });

    await expect(service.setAccountStatus(manager, 'p1', { status: 'INACTIVE' })).rejects.toThrow(
      DeliveryConflictException,
    );
  });

  it('forces OFFLINE when deactivating', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('ACTIVE', 'ONLINE'));
    db.deliveryPartnerProfile.update.mockResolvedValue(partnerSource('INACTIVE', 'OFFLINE'));
    db.deliveryAssignment.findFirst.mockResolvedValue(null);

    await service.setAccountStatus(manager, 'p1', { status: 'INACTIVE' });

    expect(db.deliveryPartnerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ availability: 'OFFLINE' }) }),
    );
  });
});

describe('DeliveryPartnerService.review', () => {
  it('begins document review from pending verification', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('PENDING_VERIFICATION', 'OFFLINE'));
    db.deliveryPartnerProfile.update.mockResolvedValue(partnerSource('DOCUMENT_REVIEW', 'OFFLINE'));

    const result = await service.review(manager, 'p1', { action: 'BEGIN_REVIEW' });

    expect(result.status).toBe('DOCUMENT_REVIEW');
  });

  it('rejects beginning review when already under review', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('DOCUMENT_REVIEW', 'OFFLINE'));

    await expect(service.review(manager, 'p1', { action: 'BEGIN_REVIEW' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('approves only when all required documents are verified', async () => {
    const { service, db } = buildService();
    const source = { ...partnerSource('DOCUMENT_REVIEW', 'OFFLINE'), documents: verifiedDocuments() };
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(source);
    const approved = { ...source, status: 'VERIFIED', identityVerified: true, addressProofVerified: true, licenceVerified: true };
    db.deliveryPartnerProfile.update.mockResolvedValue(approved);
    db.deliveryPartnerProfile.groupBy.mockResolvedValue([]);

    const result = await service.review(manager, 'p1', { action: 'APPROVE' });

    expect(result.status).toBe('VERIFIED');
    expect(result.identityVerified).toBe(true);
    expect(result.addressProofVerified).toBe(true);
    expect(result.licenceVerified).toBe(true);
  });

  it('rejects approval when a required document is missing or rejected', async () => {
    const { service, db } = buildService();
    const source = {
      ...partnerSource('DOCUMENT_REVIEW', 'OFFLINE'),
      documents: [
        { id: 'd1', type: 'AADHAAR', documentReference: 'aadhaar-ref', status: 'UPLOADED', verificationNote: null, verifiedAt: null },
        { id: 'd2', type: 'ADDRESS_PROOF', documentReference: 'addr-ref', status: 'UPLOADED', verificationNote: null, verifiedAt: null },
        { id: 'd3', type: 'PAN', documentReference: 'pan-ref', status: 'UPLOADED', verificationNote: null, verifiedAt: null },
        { id: 'd4', type: 'DRIVING_LICENSE', documentReference: 'dl-ref', status: 'REJECTED', verificationNote: 'blurry', verifiedAt: null },
      ],
    };
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(source);

    await expect(service.review(manager, 'p1', { action: 'APPROVE' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('activates a verified partner and sets joinedAt', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('VERIFIED', 'OFFLINE'));
    db.deliveryPartnerProfile.update.mockResolvedValue(
      { ...partnerSource('ACTIVE', 'OFFLINE'), joinedAt: new Date() },
    );

    const result = await service.review(manager, 'p1', { action: 'ACTIVATE' });

    expect(result.status).toBe('ACTIVE');
    const call = db.deliveryPartnerProfile.update.mock.calls[0]?.[0] as { data: { joinedAt?: Date } };
    expect(call.data.joinedAt).toBeInstanceOf(Date);
  });

  it('requires a rejection reason to reject a partner', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('DOCUMENT_REVIEW', 'OFFLINE'));

    await expect(service.review(manager, 'p1', { action: 'REJECT' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a partner and forces them offline', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('DOCUMENT_REVIEW', 'OFFLINE'));
    db.deliveryPartnerProfile.update.mockResolvedValue(
      { ...partnerSource('REJECTED', 'OFFLINE'), rejectionReason: 'fake documents' },
    );
    db.deliveryAssignment.findFirst.mockResolvedValue(null);

    const result = await service.review(manager, 'p1', { action: 'REJECT', rejectionReason: 'fake documents' });

    expect(result.status).toBe('REJECTED');
  });
});

describe('DeliveryPartnerService.upsertDocument', () => {
  it('uploads a document and resets prior verification', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(
      { ...partnerSource('PENDING_VERIFICATION', 'OFFLINE'), documents: [] },
    );

    await service.upsertDocument(manager, 'p1', { type: 'AADHAAR', documentReference: 'aadhaar-ref' });

    expect(db.deliveryPartnerDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deliveryPartnerId_type: { deliveryPartnerId: 'p1', type: 'AADHAAR' } },
        update: expect.objectContaining({ status: 'UPLOADED', verificationNote: null, verifiedAt: null }),
        create: expect.objectContaining({ status: 'UPLOADED' }),
      }),
    );
  });

  it('blocks editing documents for a suspended or rejected partner', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerSource('SUSPENDED', 'OFFLINE'));

    await expect(
      service.upsertDocument(manager, 'p1', { type: 'AADHAAR' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('DeliveryPartnerService.reviewDocument', () => {
  it('returns 404 when the document is not on the partner profile', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(
      { ...partnerSource('DOCUMENT_REVIEW', 'OFFLINE'), documents: [] },
    );

    await expect(
      service.reviewDocument(manager, 'p1', 'missing-doc', { action: 'APPROVE' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('approves a document, records reviewer and audited', async () => {
    const { service, db, audit } = buildService();
    const source = {
      ...partnerSource('DOCUMENT_REVIEW', 'OFFLINE'),
      documents: [verifiedDocuments()[0]],
    };
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(source);
    db.deliveryPartnerProfile.update.mockResolvedValue(source);

    const result = await service.reviewDocument(manager, 'p1', 'd1', { action: 'APPROVE' });

    expect(db.deliveryPartnerDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'VERIFIED',
          verifiedById: 'u-mgr',
          verifiedAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DOCUMENT_REVIEWED }),
      db,
    );
    expect(result.documents).toEqual(expect.any(Array));
  });
});

describe('DeliveryPartnerService.listCandidates', () => {
  it('returns only active partners of the scoped branch with online flag', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findMany.mockResolvedValue([
      {
        id: 'p1',
        partnerId: 'HB-DP-000042',
        fullName: 'Shiva Kumar',
        status: 'ACTIVE',
        availability: 'ONLINE',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p2',
        partnerId: 'HB-DP-000043',
        fullName: 'Ravi',
        status: 'PENDING_VERIFICATION',
        availability: 'OFFLINE',
        latitude: null,
        longitude: null,
      },
    ]);
    db.branch.findUnique.mockResolvedValue(BRANCH);
    db.deliveryPartnerProfile.groupBy.mockResolvedValue([]);

    const candidates = await service.listCandidates(manager);

    expect(db.deliveryPartnerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 'b1', status: 'ACTIVE' }),
      }),
    );
    const online = candidates.find((c) => c.id === 'p1');
    expect(online?.online).toBe(true);
  });

  it('returns an empty list when no scope is available', async () => {
    const { service } = buildService();
    const rows = await service.listCandidates(superAdmin);
    expect(rows).toEqual([]);
  });
});

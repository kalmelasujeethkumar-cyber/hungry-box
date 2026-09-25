import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { AuditKinds } from '../audit/audit.service';
import type { PrivateDocumentStorageProvider } from '../media/private-document-storage.interface';
import { KycService } from './kyc.service';

interface Db {
  deliveryPartnerProfile: {
    findUnique: Mock;
    findUniqueOrThrow: Mock;
    findFirst: Mock;
    findFirstOrThrow: Mock;
    findMany: Mock;
  };
  deliveryPartnerDocument: {
    findUnique: Mock;
    upsert: Mock;
    update: Mock;
  };
  $transaction: Mock;
}

function baseDb(): Db {
  const db: Db = {
    deliveryPartnerProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    deliveryPartnerDocument: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
  return db;
}

let db: Db;
function buildService() {
  db = baseDb();
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const storage = {
    uploadPrivateDocument: vi.fn().mockResolvedValue({
      publicId: 'hungry-box/kyc/asset1',
      resourceType: 'image',
      format: 'jpeg',
      fileSize: 3,
    }),
    deletePrivateDocument: vi.fn().mockResolvedValue(undefined),
    generatePrivateDocumentAccess: vi.fn().mockResolvedValue({
      url: 'https://res.cloudinary.com/example/private/document?signature=s',
      expiresAt: '2026-01-01T00:00:00.000Z',
    }),
  };
  const service = new KycService(prisma, audit, storage as unknown as PrivateDocumentStorageProvider);
  return { service, audit, storage };
}

const partnerBase = {
  id: 'p1',
  userId: 'u1',
  partnerId: 'HB-DP-000042',
  fullName: 'Shiva Kumar',
  mobile: '9000000000',
  branchId: 'b1',
  status: 'DOCUMENT_REVIEW',
  branch: { id: 'b1', name: 'Guntur' },
  documents: [] as unknown[],
};

function partnerOf(overrides: Record<string, unknown> = {}) {
  return {
    ...partnerBase,
    ...overrides,
    branch: { id: 'b1', name: 'Guntur' },
  };
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    deliveryPartnerId: 'p1',
    type: 'AADHAAR',
    documentReference: null,
    storageProvider: 'cloudinary',
    providerPublicId: 'hungry-box/kyc/asset1',
    resourceType: 'image',
    format: 'jpeg',
    fileSize: 3,
    status: 'UPLOADED',
    verificationNote: null,
    verifiedById: null,
    verifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const manager = { role: 'BRANCH_MANAGER' as const, branchId: 'b1', userId: 'um' };
const managerNoBranch = { role: 'BRANCH_MANAGER' as const, branchId: null, userId: 'um' };
const superAdmin = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'ua' };

function fileOf(buffer: Buffer) {
  return { buffer, mimetype: 'image/jpeg', originalname: 'document' };
}

describe('KycService partner self-service', () => {
  it('uploads an Aadhaar JPEG and reports UPLOADED with a clean DTO', async () => {
    const { service, audit, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(partnerOf());
    db.deliveryPartnerProfile.findUniqueOrThrow.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    db.deliveryPartnerDocument.findUnique.mockResolvedValue(null);

    const result = await service.uploadMyDocument('u1', 'AADHAAR', fileOf(jpeg));

    expect(storage.uploadPrivateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'hungry-box/kyc',
        format: 'jpeg',
      }),
    );
    expect((storage.uploadPrivateDocument as Mock).mock.calls[0]?.[0]?.buffer).toBe(jpeg);
    expect(result.overallState).toBe('AWAITING_REVIEW');
    const aadhaar = result.documents.find((document) => document.type === 'AADHAAR');
    expect(aadhaar?.status).toBe('UPLOADED');
    expect(JSON.stringify(result)).not.toContain('providerPublicId');
    expect(JSON.stringify(result)).not.toContain('https://');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.KYC_DOCUMENT_UPLOADED }),
    );
  });

  it('uploads a Driving licence PNG', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(partnerOf());
    db.deliveryPartnerProfile.findUniqueOrThrow.mockResolvedValue(
      partnerOf({ documents: [documentRow({ id: 'd2', type: 'DRIVING_LICENSE', status: 'UPLOADED' })] }),
    );
    db.deliveryPartnerDocument.findUnique.mockResolvedValue(null);

    const result = await service.uploadMyDocument('u1', 'DRIVING_LICENSE', fileOf(png));

    expect(result.documents.find((document) => document.type === 'DRIVING_LICENSE')?.status).toBe(
      'UPLOADED',
    );
  });

  it('rejects an unsupported document type', async () => {
    const { service, storage } = buildService();
    await expect(service.uploadMyDocument('u1', 'PAN', fileOf(jpeg))).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.uploadMyDocument('u1', 'garbage', fileOf(jpeg))).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  it('rejects a missing file and a non-image file', async () => {
    const { service, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(partnerOf());
    await expect(service.uploadMyDocument('u1', 'AADHAAR', undefined)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.uploadMyDocument('u1', 'AADHAAR', fileOf(Buffer.from('GIF89a....'))),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.uploadMyDocument('u1', 'AADHAAR', fileOf(Buffer.from('%PDF-1.7'))),
    ).rejects.toThrow(BadRequestException);
    expect(storage.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  it('rejects a payload larger than 5 MB before touching storage', async () => {
    const { service, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(partnerOf());
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
    await expect(service.uploadMyDocument('u1', 'AADHAAR', fileOf(big))).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  it('blocks uploads for a suspended or rejected partner', async () => {
    for (const status of ['SUSPENDED', 'REJECTED']) {
      const { service, storage } = buildService();
      db.deliveryPartnerProfile.findUnique.mockResolvedValue(partnerOf({ status }));
      await expect(service.uploadMyDocument('u1', 'AADHAAR', fileOf(jpeg))).rejects.toThrow(
        ConflictException,
      );
      expect(storage.uploadPrivateDocument).not.toHaveBeenCalled();
    }
  });

  it('re-uploads a rejected document, replacing the old asset and clearing review fields', async () => {
    const { service, audit, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({
        documents: [
          documentRow({ status: 'REJECTED', verificationNote: 'blurred', providerPublicId: 'hungry-box/kyc/old1' }),
        ],
      }),
    );
    db.deliveryPartnerProfile.findUniqueOrThrow.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    db.deliveryPartnerDocument.findUnique.mockResolvedValue(
      documentRow({ status: 'REJECTED', providerPublicId: 'hungry-box/kyc/old1' }),
    );

    const result = await service.uploadMyDocument('u1', 'AADHAAR', fileOf(jpeg));

    expect(storage.deletePrivateDocument).toHaveBeenCalledWith('hungry-box/kyc/old1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.KYC_DOCUMENT_REUPLOADED }),
    );
    const aadhaar = result.documents.find((document) => document.type === 'AADHAAR');
    expect(aadhaar?.status).toBe('UPLOADED');
    expect(aadhaar?.verificationNote).toBeNull();
  });

  it('refuses to replace a verified document', async () => {
    const { service, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'VERIFIED' })] }),
    );
    await expect(service.uploadMyDocument('u1', 'AADHAAR', fileOf(jpeg))).rejects.toThrow(
      ConflictException,
    );
    expect(storage.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  it('cleans up the newly uploaded asset when the database write fails', async () => {
    const { service, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'REJECTED', providerPublicId: 'hungry-box/kyc/old1' })] }),
    );
    db.$transaction = vi.fn().mockRejectedValue(new Error('db boom'));

    await expect(service.uploadMyDocument('u1', 'AADHAAR', fileOf(jpeg))).rejects.toThrow(
      'db boom',
    );
    expect(storage.deletePrivateDocument).toHaveBeenCalledWith('hungry-box/kyc/asset1');
  });

  it('records a cleanup failure but still succeeds when deleting an old asset fails', async () => {
    const { service, audit, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({
        documents: [documentRow({ status: 'REJECTED', providerPublicId: 'hungry-box/kyc/old1' })],
      }),
    );
    db.deliveryPartnerProfile.findUniqueOrThrow.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    db.deliveryPartnerDocument.findUnique.mockResolvedValue(
      documentRow({ status: 'REJECTED', providerPublicId: 'hungry-box/kyc/old1' }),
    );
    storage.deletePrivateDocument.mockRejectedValueOnce(new Error('cleanup boometed'));

    const result = await service.uploadMyDocument('u1', 'AADHAAR', fileOf(jpeg));

    expect(result.documents.find((document) => document.type === 'AADHAAR')?.status).toBe(
      'UPLOADED',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.KYC_CLEANUP_FAILED }),
    );
  });

  it('returns NotFound when the partner has no profile', async () => {
    const { service, storage } = buildService();
    await expect(service.getMyKyc('u1')).rejects.toThrow(NotFoundException);
    await expect(service.uploadMyDocument('u1', 'AADHAAR', fileOf(jpeg))).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  it('returns the overall state only after Aadhaar AND Driving licence are verified', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(partnerOf({ documents: [] }));

    await expect(service.getMyKyc('u1')).resolves.toMatchObject({
      overallState: 'INCOMPLETE',
    });

    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({
        documents: [
          documentRow({ type: 'AADHAAR', status: 'VERIFIED' }),
          documentRow({ id: 'd2', type: 'DRIVING_LICENSE', status: 'UPLOADED' }),
        ],
      }),
    );
    await expect(service.getMyKyc('u1')).resolves.toMatchObject({ overallState: 'AWAITING_REVIEW' });

    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({
        documents: [
          documentRow({ type: 'AADHAAR', status: 'VERIFIED' }),
          documentRow({ id: 'd2', type: 'DRIVING_LICENSE', status: 'REJECTED', verificationNote: 'unreadable' }),
        ],
      }),
    );
    await expect(service.getMyKyc('u1')).resolves.toMatchObject({ overallState: 'ACTION_REQUIRED' });

    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({
        documents: [
          documentRow({ type: 'AADHAAR', status: 'VERIFIED' }),
          documentRow({ id: 'd2', type: 'DRIVING_LICENSE', status: 'VERIFIED' }),
        ],
      }),
    );
    await expect(service.getMyKyc('u1')).resolves.toMatchObject({ overallState: 'VERIFIED' });
  });

  it('grants the partner short-lived signed access to their own document', async () => {
    const { service, audit, storage } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );

    const access = await service.getMyDocumentAccess('u1', 'AADHAAR');

    expect(storage.generatePrivateDocumentAccess).toHaveBeenCalledWith({
      publicId: 'hungry-box/kyc/asset1',
      format: 'jpeg',
    });
    expect(access.url.length).toBeGreaterThan(0);
    expect(access.expiresAt).toBe('2026-01-01T00:00:00.000Z');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.KYC_DOCUMENT_VIEWED }),
    );
    const message = (audit.record as Mock).mock.calls[0]?.[0]?.message as string;
    expect(message).not.toContain('https');
  });

  it('returns NotFound when the partner has no document asset to view', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue(partnerOf({ documents: [] }));
    await expect(service.getMyDocumentAccess('u1', 'AADHAAR')).rejects.toThrow(NotFoundException);
  });
});

describe('KycService branch management', () => {
  it('scopes a manager list to their own branch', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findMany.mockResolvedValue([
      {
        id: 'p1',
        partnerId: 'HB-DP-000042',
        fullName: 'Shiva Kumar',
        mobile: '9000000000',
        status: 'DOCUMENT_REVIEW',
        documents: [{ type: 'AADHAAR', status: 'UPLOADED' }],
      },
    ]);

    const rows = await service.list(manager);

    expect(db.deliveryPartnerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: 'b1' } }),
    );
    expect(rows[0]?.partnerId).toBe('HB-DP-000042');
  });

  it('lets a super admin list across all branches or a chosen branch', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findMany.mockResolvedValue([]);

    await service.list(superAdmin);
    expect(db.deliveryPartnerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );

    await service.list(superAdmin, 'b2');
    expect(db.deliveryPartnerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: 'b2' } }),
    );
  });

  it('forbids a branch manager with no assigned branch', async () => {
    const { service } = buildService();
    await expect(service.list(managerNoBranch)).rejects.toThrow(ConflictException);
    await expect(service.get(managerNoBranch, 'p1')).rejects.toThrow(ConflictException);
  });

  it('hides a partner from a manager of a different branch (IDOR protection)', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(null);
    await expect(service.get(manager, 'p-other')).rejects.toThrow(NotFoundException);
    await expect(service.getDocumentAccess(manager, 'p-other', 'AADHAAR')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.reviewDocument(manager, 'p-other', 'AADHAAR', { action: 'VERIFY' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows a super admin to fetch and view any partner', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    await expect(service.get(superAdmin, 'p1')).resolves.toMatchObject({ partnerId: 'HB-DP-000042' });
    await expect(service.getDocumentAccess(superAdmin, 'p1', 'AADHAAR')).resolves.toMatchObject({
      expiresAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('verifies a document as a branch manager', async () => {
    const { service, audit } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    db.deliveryPartnerProfile.findFirstOrThrow.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'VERIFIED' })] }),
    );

    const result = await service.reviewDocument(manager, 'p1', 'AADHAAR', {
      action: 'VERIFY',
      note: 'looks good',
    });

    expect(db.deliveryPartnerDocument.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({
        status: 'VERIFIED',
        verificationNote: 'looks good',
        verifiedById: 'um',
        verifiedAt: expect.any(Date) as Date,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.KYC_DOCUMENT_VERIFIED }),
      expect.anything(),
    );
    expect(result.documents.find((document) => document.type === 'AADHAAR')?.status).toBe(
      'VERIFIED',
    );
  });

  it('rejects a document with a reason as a branch manager', async () => {
    const { service, audit } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    db.deliveryPartnerProfile.findFirstOrThrow.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'REJECTED', verificationNote: 'blurred image' })] }),
    );

    const result = await service.reviewDocument(manager, 'p1', 'AADHAAR', {
      action: 'REJECT',
      note: 'blurred image',
    });

    expect(db.deliveryPartnerDocument.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({
        status: 'REJECTED',
        verificationNote: 'blurred image',
        verifiedById: null,
        verifiedAt: null,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.KYC_DOCUMENT_REJECTED }),
      expect.anything(),
    );
    expect(result.documents.find((document) => document.type === 'AADHAAR')?.status).toBe(
      'REJECTED',
    );
  });

  it('requires a reason to reject a document', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    await expect(
      service.reviewDocument(manager, 'p1', 'AADHAAR', { action: 'REJECT' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('forbids a super admin from reviewing documents', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(
      partnerOf({ documents: [documentRow({ status: 'UPLOADED' })] }),
    );
    await expect(
      service.reviewDocument(superAdmin, 'p1', 'AADHAAR', { action: 'VERIFY' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids review on a missing document', async () => {
    const { service } = buildService();
    db.deliveryPartnerProfile.findFirst.mockResolvedValue(partnerOf({ documents: [] }));
    await expect(
      service.reviewDocument(manager, 'p1', 'AADHAAR', { action: 'VERIFY' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects unsupported review types before touching the profile', async () => {
    const { service } = buildService();
    await expect(
      service.reviewDocument(manager, 'p1', 'PAN', { action: 'VERIFY' }),
    ).rejects.toThrow(BadRequestException);
  });
});
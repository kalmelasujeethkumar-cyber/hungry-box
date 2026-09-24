import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { BranchesService } from './branches.service';

const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

function buildService<T extends Record<string, unknown>>(db: T) {
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new BranchesService(prisma, audit);
  return { service, db, audit };
}

function branchRow(status: string) {
  return {
    id: 'b1',
    code: 'guntur',
    name: 'Hungry Box Guntur',
    city: 'Guntur',
    state: 'Andhra Pradesh',
    country: 'India',
    address: null,
    latitude: null,
    longitude: null,
    deliveryRadiusKm: 10,
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('BranchesService.update', () => {
  it('updates provided fields and audits BRANCH_UPDATED', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'Hungry Box Guntur' }),
        update: vi.fn().mockResolvedValue(branchRow('ACTIVE')),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.update(SUPER_ADMIN, 'b1', { deliveryRadiusKm: 15 });

    expect(result.deliveryRadiusKm).toBe(10);
    expect(db.branch.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { deliveryRadiusKm: 15 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.BRANCH_UPDATED,
        entityType: 'branch',
        entityId: 'b1',
        branchId: 'b1',
      }),
    );
  });

  it('throws NotFoundException when the branch does not exist', async () => {
    const db = { branch: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const { service } = buildService(db);

    await expect(service.update(SUPER_ADMIN, 'missing', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    expect(db.branch.update).not.toHaveBeenCalled();
  });
});

describe('BranchesService.setStatus', () => {
  it('changes the status and audits BRANCH_STATUS_CHANGED', async () => {
    const db = {
      branch: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'b1', name: 'Hungry Box Guntur', status: 'ACTIVE' })
          .mockResolvedValueOnce(branchRow('PAUSED')),
        update: vi.fn().mockResolvedValue(branchRow('PAUSED')),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.setStatus(SUPER_ADMIN, 'b1', { status: 'PAUSED' });

    expect(result.status).toBe('PAUSED');
    expect(db.branch.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAUSED' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.BRANCH_STATUS_CHANGED,
        entityId: 'b1',
        branchId: 'b1',
      }),
    );
  });

  it('rejects a no-op status change', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'X', status: 'ACTIVE' }),
        update: vi.fn(),
      },
    };
    const { service } = buildService(db);

    await expect(service.setStatus(SUPER_ADMIN, 'b1', { status: 'ACTIVE' })).rejects.toThrow(
      BadRequestException,
    );
    expect(db.branch.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the branch does not exist', async () => {
    const db = { branch: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const { service } = buildService(db);

    await expect(service.setStatus(SUPER_ADMIN, 'missing', { status: 'PAUSED' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

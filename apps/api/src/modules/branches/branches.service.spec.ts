import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BranchesService } from './branches.service';

const MANAGER = { role: 'BRANCH_MANAGER' as const, branchId: 'branch-guntur', userId: 'u-mgr' };
const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

function buildService<T extends Record<string, unknown>>(db: T) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new BranchesService(prisma, audit);
  return { service, db, audit };
}

function branchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'branch-guntur',
    code: 'guntur',
    name: 'Hungry Box Guntur',
    city: 'Guntur',
    state: 'Andhra Pradesh',
    country: 'India',
    address: null,
    latitude: new Prisma.Decimal('16.3067'),
    longitude: new Prisma.Decimal('80.4365'),
    deliveryRadiusKm: new Prisma.Decimal('10'),
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('BranchesService.list', () => {
  it('maps decimals and dates to a BranchDto', async () => {
    const db = {
      branch: { findMany: vi.fn().mockResolvedValue([branchRow()]) },
    };
    const { service } = buildService(db);

    const result = await service.list();

    expect(result[0]).toMatchObject({
      id: 'branch-guntur',
      code: 'guntur',
      deliveryRadiusKm: 10,
      latitude: 16.3067,
      longitude: 80.4365,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('BranchesService.create', () => {
  it('creates a branch and returns the dto', async () => {
    const db = {
      branch: { create: vi.fn().mockResolvedValue(branchRow()) },
    };
    const { service, db: rawDb } = buildService(db);

    const result = await service.create({
      code: 'guntur',
      name: 'Hungry Box Guntur',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      country: 'India',
      deliveryRadiusKm: 10,
    });

    expect(result.code).toBe('guntur');
    expect(rawDb.branch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'guntur',
        latitude: null,
        longitude: null,
        deliveryRadiusKm: 10,
      }),
    });
  });

  it('maps a unique-constraint violation to ConflictException', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    const db = {
      branch: { create: vi.fn().mockRejectedValue(conflict) },
    };
    const { service } = buildService(db);

    await expect(
      service.create({
        code: 'guntur',
        name: 'Duplicate',
        city: 'Guntur',
        state: 'Andhra Pradesh',
        country: 'India',
        deliveryRadiusKm: 10,
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('BranchesService.getSettings', () => {
  it('pins a branch manager to their own branch', async () => {
    const db = {
      branch: {
        findUnique: vi
          .fn()
          .mockResolvedValue(branchRow({ name: 'Guntur HQ', id: 'branch-guntur' })),
      },
    };
    const { service } = buildService(db);

    const result = await service.getSettings(MANAGER, 'some-other-branch');

    expect(result.id).toBe('branch-guntur');
    expect(db.branch.findUnique).toHaveBeenCalledWith({ where: { id: 'branch-guntur' } });
  });

  it('lets a super admin read any branch via branchId query', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue(branchRow({ id: 'branch-hyd', name: 'Hyd' })),
      },
    };
    const { service } = buildService(db);

    await service.getSettings(SUPER_ADMIN, 'branch-hyd');

    expect(db.branch.findUnique).toHaveBeenCalledWith({ where: { id: 'branch-hyd' } });
  });

  it('requires a branchId for super-admin reads', async () => {
    const { service } = buildService({});

    await expect(service.getSettings(SUPER_ADMIN, undefined)).rejects.toThrow(BadRequestException);
  });
});

describe('BranchesService.updateSettings', () => {
  it('updates the delivery radius and address and audits the change', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'branch-guntur', name: 'Guntur HQ' }),
        update: vi
          .fn()
          .mockResolvedValue(branchRow({ deliveryRadiusKm: new Prisma.Decimal('12') })),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.updateSettings(MANAGER, {
      deliveryRadiusKm: 12,
      address: 'MG Road, Guntur',
    });

    expect(db.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-guntur' },
      data: expect.objectContaining({ deliveryRadiusKm: 12, address: 'MG Road, Guntur' }),
    });
    expect(result.deliveryRadiusKm).toBe(12);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'BRANCH_SETTINGS_UPDATED',
        branchId: 'branch-guntur',
      }),
    );
  });

  it('ignores a client-supplied branchId for managers (no IDOR)', async () => {
    const db = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: 'branch-guntur', name: 'Guntur HQ' }),
        update: vi.fn().mockResolvedValue(branchRow({ name: 'Guntur HQ' })),
      },
    };
    const { service } = buildService(db);

    await service.updateSettings(MANAGER, { address: 'Pinned' }, 'branch-other');

    expect(db.branch.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'branch-guntur' } }),
    );
    expect(db.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-guntur' },
      data: expect.objectContaining({ address: 'Pinned' }),
    });
  });

  it('rejects a manual update without a branchId', async () => {
    const { service } = buildService({});

    await expect(service.updateSettings(SUPER_ADMIN, { address: 'X' }, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });
});

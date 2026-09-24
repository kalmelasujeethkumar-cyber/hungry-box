import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchesService } from './branches.service';

function buildService(db: Record<string, unknown>) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  return new BranchesService(prisma);
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
    const service = buildService(db);

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
    const service = buildService(db);

    const result = await service.create({
      code: 'guntur',
      name: 'Hungry Box Guntur',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      country: 'India',
      deliveryRadiusKm: 10,
    });

    expect(result.code).toBe('guntur');
    expect(db.branch.create).toHaveBeenCalledWith({
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
    const service = buildService(db);

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

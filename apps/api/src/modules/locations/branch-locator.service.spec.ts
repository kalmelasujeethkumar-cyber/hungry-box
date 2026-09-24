import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchLocatorService } from './branch-locator.service';
import { haversineKm } from './geo';

function buildService(db: Record<string, unknown>) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  return new BranchLocatorService(prisma);
}

describe('haversineKm', () => {
  it('computes roughly 111km per degree of latitude at the equator', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 0);
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 0);
  });

  it('is symmetric', () => {
    expect(haversineKm(16.3067, 80.4365, 16.2, 80.4)).toBeCloseTo(
      haversineKm(16.2, 80.4, 16.3067, 80.4365),
      6,
    );
  });
});

describe('BranchLocatorService.locate', () => {
  function branchRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      name: 'Hungry Box Branch',
      code: id,
      city: 'Guntur',
      deliveryRadiusKm: 10,
      latitude: 16.3067,
      longitude: 80.4365,
      ...overrides,
    };
  }

  it('returns the nearest active branch sorted by distance', async () => {
    const db = {
      branch: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            branchRow('far', { latitude: 16.9, longitude: 80.6 }),
            branchRow('near', { latitude: 16.31, longitude: 80.44 }),
          ]),
      },
    };
    const service = buildService(db);

    const result = await service.locate(16.3067, 80.4365);

    expect(result?.branchId).toBe('near');
    expect(result!.distanceKm).toBeLessThan(1);
    expect(db.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('ignores inactive branches', async () => {
    const db = {
      branch: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = buildService(db);

    const result = await service.locate(16.3067, 80.4365);

    expect(result).toBeNull();
  });

  it('converts Decimal coordinates to numbers for distance math', async () => {
    const guntur = { latitude: 16.3067, longitude: 80.4365 };
    const db = {
      branch: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'guntur',
            name: 'Guntur',
            code: 'guntur',
            city: 'Guntur',
            deliveryRadiusKm: 10,
            latitude: new Prisma.Decimal(guntur.latitude),
            longitude: new Prisma.Decimal(guntur.longitude),
          },
        ]),
      },
    };
    const service = buildService(db);

    const result = await service.locate(guntur.latitude, guntur.longitude);

    expect(result?.distanceKm).toBeLessThan(0.001);
  });
});

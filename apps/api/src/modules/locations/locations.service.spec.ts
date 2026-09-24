import { describe, expect, it, vi } from 'vitest';
import { BranchLocatorService } from './branch-locator.service';
import { LocationsService } from './locations.service';

function buildService(locator?: Pick<BranchLocatorService, 'locate'>) {
  const stub = locator ?? {
    locate: vi.fn().mockResolvedValue(null),
  };
  return new LocationsService(stub as BranchLocatorService);
}

describe('LocationsService.check', () => {
  it('is serviceable when inside the branch configured radius', async () => {
    const service = buildService({
      locate: vi.fn().mockResolvedValue({
        branchId: 'guntur',
        name: 'Hungry Box Guntur (Demo)',
        code: 'guntur',
        city: 'Guntur',
        deliveryRadiusKm: 10,
        latitude: 16.3067,
        longitude: 80.4365,
        distanceKm: 7.43,
      }),
    });

    const result = await service.check(16.1, 80.4);

    expect(result).toEqual({
      serviceable: true,
      distanceKm: 7.4,
      branch: {
        id: 'guntur',
        name: 'Hungry Box Guntur (Demo)',
        code: 'guntur',
        city: 'Guntur',
        deliveryRadiusKm: 10,
      },
    });
  });

  it('is not serviceable outside the radius and omits the branch', async () => {
    const service = buildService({
      locate: vi.fn().mockResolvedValue({
        branchId: 'guntur',
        name: 'Hungry Box Guntur (Demo)',
        code: 'guntur',
        city: 'Guntur',
        deliveryRadiusKm: 10,
        latitude: 16.3067,
        longitude: 80.4365,
        distanceKm: 12.84,
      }),
    });

    const result = await service.check(16.0, 80.7);

    expect(result).toEqual({
      serviceable: false,
      distanceKm: 12.8,
      branch: null,
    });
  });

  it('uses the branch configured radius for the threshold', async () => {
    const service = buildService({
      locate: vi.fn().mockResolvedValue({
        branchId: 'guntur',
        name: 'Hungry Box Guntur (Demo)',
        code: 'guntur',
        city: 'Guntur',
        deliveryRadiusKm: 5,
        latitude: 16.3067,
        longitude: 80.4365,
        distanceKm: 7.43,
      }),
    });

    const result = await service.check(16.1, 80.4);

    expect(result.serviceable).toBe(false);
  });

  it('succeeds exactly at the radius boundary', async () => {
    const service = buildService({
      locate: vi.fn().mockResolvedValue({
        branchId: 'guntur',
        name: 'Hungry Box Guntur (Demo)',
        code: 'guntur',
        city: 'Guntur',
        deliveryRadiusKm: 10,
        latitude: 16.3067,
        longitude: 80.4365,
        distanceKm: 10,
      }),
    });

    const result = await service.check(16.1, 80.4);

    expect(result.serviceable).toBe(true);
  });

  it('returns a null distance when no branch exists', async () => {
    const service = buildService();

    const result = await service.check(16.3067, 80.4365);

    expect(result).toEqual({ serviceable: false, distanceKm: null, branch: null });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { BranchStatus } from '../generated/prisma/enums';
import { provisionBranch, type ProvisionBranchDeps } from './provision-branch';

const INPUT = {
  code: 'vijayawada',
  name: 'Hungry Box Vijayawada',
  city: 'Vijayawada',
  state: 'Andhra Pradesh',
  country: 'India',
  deliveryRadiusKm: 8,
};

function buildDeps(overrides: Partial<ProvisionBranchDeps> = {}): ProvisionBranchDeps {
  return {
    findBranchByCode: vi.fn().mockResolvedValue(null),
    createBranch: vi.fn().mockResolvedValue({ id: 'b-1' }),
    ...overrides,
  };
}

describe('validateBranchInput', () => {
  it('rejects missing required fields', async () => {
    const deps = buildDeps();
    const result = await provisionBranch({ ...INPUT, name: ' ' }, deps);
    expect(result.outcome).toBe('invalid');
    expect(deps.createBranch).not.toHaveBeenCalled();
  });

  it('rejects an invalid branch code', async () => {
    const deps = buildDeps();
    const result = await provisionBranch({ ...INPUT, code: 'Vijayawada!' }, deps);
    expect(result.outcome).toBe('invalid');
    expect(deps.createBranch).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range delivery radius', async () => {
    const deps = buildDeps();
    const result = await provisionBranch({ ...INPUT, deliveryRadiusKm: 250 }, deps);
    expect(result.outcome).toBe('invalid');
    expect(deps.createBranch).not.toHaveBeenCalled();
  });

  it('rejects out-of-range coordinates', async () => {
    const deps = buildDeps();
    const result = await provisionBranch({ ...INPUT, latitude: 91 }, deps);
    expect(result.outcome).toBe('invalid');
    expect(deps.createBranch).not.toHaveBeenCalled();
  });
});

describe('provisionBranch', () => {
  it('creates an ACTIVE branch from explicit input', async () => {
    const deps = buildDeps();
    const result = await provisionBranch({ ...INPUT, latitude: 16.5062, longitude: 80.648 }, deps);

    expect(result).toEqual({ outcome: 'created', branchId: 'b-1' });
    expect(deps.createBranch).toHaveBeenCalledWith({
      code: 'vijayawada',
      name: 'Hungry Box Vijayawada',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      country: 'India',
      address: null,
      latitude: 16.5062,
      longitude: 80.648,
      deliveryRadiusKm: 8,
      status: BranchStatus.ACTIVE,
    });
  });

  it('does not overwrite an existing branch with the same code', async () => {
    const deps = buildDeps({
      findBranchByCode: vi.fn().mockResolvedValue({ id: 'b-existing' }),
    });
    const result = await provisionBranch(INPUT, deps);

    expect(result).toEqual({ outcome: 'already_exists', branchId: 'b-existing' });
    expect(deps.createBranch).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Role, UserStatus } from '../generated/prisma/enums';
import { provisionSuperAdmin, type ProvisionAdminDeps } from './provision-admin';

const hashPassword = vi
  .fn()
  .mockImplementation((password: string) => Promise.resolve(`hash:${password}`));

function buildDeps(overrides: Partial<ProvisionAdminDeps> = {}): ProvisionAdminDeps {
  return {
    findUserByLoginId: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({ id: 'u-1' }),
    hashPassword,
    ...overrides,
  };
}

const INPUT = {
  loginId: 'admin@hungrybox.in',
  password: 'correct horse battery staple',
  name: 'Super Admin',
};

describe('provisionSuperAdmin', () => {
  it('creates an ACTIVE SUPER_ADMIN with an Argon2 hash when none exists', async () => {
    const deps = buildDeps();
    const result = await provisionSuperAdmin(INPUT, deps);

    expect(result).toEqual({ outcome: 'created', userId: 'u-1' });
    expect(deps.createUser).toHaveBeenCalledWith({
      loginId: 'admin@hungrybox.in',
      name: 'Super Admin',
      passwordHash: `hash:${INPUT.password}`,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });
    expect(hashPassword).toHaveBeenCalledWith(INPUT.password);
  });

  it('is idempotent when the SUPER_ADMIN already exists and is active', async () => {
    const deps = buildDeps({
      findUserByLoginId: vi
        .fn()
        .mockResolvedValue({ id: 'u-old', role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE }),
    });
    const result = await provisionSuperAdmin(INPUT, deps);

    expect(result).toEqual({ outcome: 'already_active_super_admin', userId: 'u-old' });
    expect(deps.createUser).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('refuses to promote an existing non-SUPER_ADMIN user', async () => {
    const deps = buildDeps({
      findUserByLoginId: vi
        .fn()
        .mockResolvedValue({ id: 'u-customer', role: Role.CUSTOMER, status: UserStatus.ACTIVE }),
    });
    const result = await provisionSuperAdmin(INPUT, deps);

    expect(result.outcome).toBe('refused');
    if (result.outcome === 'refused') expect(result.reason).toMatch(/not a SUPER_ADMIN/);
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('refuses to reactivate a suspended SUPER_ADMIN', async () => {
    const deps = buildDeps({
      findUserByLoginId: vi
        .fn()
        .mockResolvedValue({ id: 'u-sus', role: Role.SUPER_ADMIN, status: UserStatus.SUSPENDED }),
    });
    const result = await provisionSuperAdmin(INPUT, deps);

    expect(result.outcome).toBe('refused');
    if (result.outcome === 'refused') expect(result.reason).toMatch(/reactivate/i);
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('normalizes the login id the same way the auth flow does', async () => {
    const deps = buildDeps();
    await provisionSuperAdmin({ ...INPUT, loginId: '  Admin@HungryBox.In ' }, deps);
    expect(deps.findUserByLoginId).toHaveBeenCalledWith('admin@hungrybox.in');
    expect(deps.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ loginId: 'admin@hungrybox.in' }),
    );
  });
});

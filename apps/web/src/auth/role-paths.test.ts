import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS, homePathForRole } from './role-paths';

describe('homePathForRole', () => {
  it('maps every role to its dedicated home path', () => {
    expect(homePathForRole('SUPER_ADMIN')).toBe(ROLE_HOME_PATHS.SUPER_ADMIN);
    expect(homePathForRole('BRANCH_MANAGER')).toBe(ROLE_HOME_PATHS.BRANCH_MANAGER);
    expect(homePathForRole('DELIVERY_PARTNER')).toBe(ROLE_HOME_PATHS.DELIVERY_PARTNER);
    expect(homePathForRole('CUSTOMER')).toBe(ROLE_HOME_PATHS.CUSTOMER);
  });

  it('uses distinct paths per role', () => {
    const paths = Object.values(ROLE_HOME_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('falls back to the public home path without a role', () => {
    expect(homePathForRole(null)).toBe('/');
    expect(homePathForRole(undefined)).toBe('/');
  });
});

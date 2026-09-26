import { describe, expect, it } from 'vitest';
import {
  ROLE_HOME_PATHS,
  canRoleAccessPath,
  homePathForRole,
  isManagementRole,
  resolvePostLoginPath,
} from './role-paths';
import {
  ADMIN_ORDERS_PATH,
  BRANCH_ASSIGNMENTS_PATH,
  BRANCH_ORDERS_PATH,
  MANAGEMENT_BASE_PATH,
  MANAGEMENT_DASHBOARD_PATH,
} from '../routes/paths';

describe('homePathForRole', () => {
  it('maps every role to its home path', () => {
    expect(homePathForRole('SUPER_ADMIN')).toBe(ROLE_HOME_PATHS.SUPER_ADMIN);
    expect(homePathForRole('BRANCH_MANAGER')).toBe(ROLE_HOME_PATHS.BRANCH_MANAGER);
    expect(homePathForRole('DELIVERY_PARTNER')).toBe(ROLE_HOME_PATHS.DELIVERY_PARTNER);
    expect(homePathForRole('CUSTOMER')).toBe(ROLE_HOME_PATHS.CUSTOMER);
  });

  it('sends both management roles to the single management dashboard', () => {
    expect(homePathForRole('SUPER_ADMIN')).toBe(MANAGEMENT_DASHBOARD_PATH);
    expect(homePathForRole('BRANCH_MANAGER')).toBe(MANAGEMENT_DASHBOARD_PATH);
  });

  it('keeps non-management roles on their own distinct paths', () => {
    expect(ROLE_HOME_PATHS.DELIVERY_PARTNER).toBe('/delivery');
    expect(ROLE_HOME_PATHS.CUSTOMER).toBe('/customer');
    expect(ROLE_HOME_PATHS.DELIVERY_PARTNER).not.toBe(ROLE_HOME_PATHS.CUSTOMER);
  });

  it('never sends a non-management role into the management area', () => {
    expect(ROLE_HOME_PATHS.DELIVERY_PARTNER.startsWith(MANAGEMENT_BASE_PATH)).toBe(false);
    expect(ROLE_HOME_PATHS.CUSTOMER.startsWith(MANAGEMENT_BASE_PATH)).toBe(false);
  });

  it('falls back to the public home path without a role', () => {
    expect(homePathForRole(null)).toBe('/');
    expect(homePathForRole(undefined)).toBe('/');
  });
});

describe('isManagementRole', () => {
  it('accepts only the two management roles', () => {
    expect(isManagementRole('SUPER_ADMIN')).toBe(true);
    expect(isManagementRole('BRANCH_MANAGER')).toBe(true);
    expect(isManagementRole('CUSTOMER')).toBe(false);
    expect(isManagementRole('DELIVERY_PARTNER')).toBe(false);
    expect(isManagementRole(null)).toBe(false);
  });
});

describe('canRoleAccessPath', () => {
  it('lets both management roles reach the shared dashboard and entry', () => {
    expect(canRoleAccessPath('SUPER_ADMIN', MANAGEMENT_DASHBOARD_PATH)).toBe(true);
    expect(canRoleAccessPath('BRANCH_MANAGER', MANAGEMENT_DASHBOARD_PATH)).toBe(true);
    expect(canRoleAccessPath('SUPER_ADMIN', MANAGEMENT_BASE_PATH)).toBe(true);
    expect(canRoleAccessPath('BRANCH_MANAGER', MANAGEMENT_BASE_PATH)).toBe(true);
  });

  it('keeps a Branch Manager out of Super Admin segments', () => {
    expect(canRoleAccessPath('BRANCH_MANAGER', ADMIN_ORDERS_PATH)).toBe(false);
    expect(canRoleAccessPath('BRANCH_MANAGER', `${ADMIN_ORDERS_PATH}/ord-1`)).toBe(false);
  });

  it('keeps a Super Admin out of Branch Manager segments', () => {
    expect(canRoleAccessPath('SUPER_ADMIN', BRANCH_ORDERS_PATH)).toBe(false);
    expect(canRoleAccessPath('SUPER_ADMIN', BRANCH_ASSIGNMENTS_PATH)).toBe(false);
  });

  it('allows each role into its own segments including detail paths', () => {
    expect(canRoleAccessPath('SUPER_ADMIN', ADMIN_ORDERS_PATH)).toBe(true);
    expect(canRoleAccessPath('BRANCH_MANAGER', BRANCH_ORDERS_PATH)).toBe(true);
    expect(canRoleAccessPath('BRANCH_MANAGER', `${BRANCH_ORDERS_PATH}/ord-1`)).toBe(true);
  });

  it('does not treat a shared prefix as access', () => {
    expect(canRoleAccessPath('SUPER_ADMIN', '/admin')).toBe(true);
    expect(canRoleAccessPath('BRANCH_MANAGER', '/admin')).toBe(true);
    expect(canRoleAccessPath('CUSTOMER', MANAGEMENT_DASHBOARD_PATH)).toBe(false);
  });

  it('denies management paths to non-management roles', () => {
    expect(canRoleAccessPath('CUSTOMER', ADMIN_ORDERS_PATH)).toBe(false);
    expect(canRoleAccessPath('DELIVERY_PARTNER', BRANCH_ORDERS_PATH)).toBe(false);
  });
});

describe('resolvePostLoginPath', () => {
  it('honours a deep link the signed-in role may use', () => {
    expect(resolvePostLoginPath('BRANCH_MANAGER', BRANCH_ORDERS_PATH)).toBe(BRANCH_ORDERS_PATH);
    expect(resolvePostLoginPath('SUPER_ADMIN', ADMIN_ORDERS_PATH)).toBe(ADMIN_ORDERS_PATH);
  });

  it('refuses a deep link belonging to the other management role', () => {
    expect(resolvePostLoginPath('BRANCH_MANAGER', ADMIN_ORDERS_PATH)).toBe(
      MANAGEMENT_DASHBOARD_PATH,
    );
    expect(resolvePostLoginPath('SUPER_ADMIN', BRANCH_ORDERS_PATH)).toBe(
      MANAGEMENT_DASHBOARD_PATH,
    );
  });

  it('never lands on the login entry or the dashboard as a deep link', () => {
    expect(resolvePostLoginPath('SUPER_ADMIN', MANAGEMENT_BASE_PATH)).toBe(
      MANAGEMENT_DASHBOARD_PATH,
    );
    expect(resolvePostLoginPath('BRANCH_MANAGER', MANAGEMENT_DASHBOARD_PATH)).toBe(
      MANAGEMENT_DASHBOARD_PATH,
    );
  });

  it('sends non-management roles to their own home whatever they requested', () => {
    expect(resolvePostLoginPath('CUSTOMER', MANAGEMENT_DASHBOARD_PATH)).toBe('/customer');
    expect(resolvePostLoginPath('DELIVERY_PARTNER', ADMIN_ORDERS_PATH)).toBe('/delivery');
  });

  it('ignores missing, relative or external targets', () => {
    expect(resolvePostLoginPath('SUPER_ADMIN', undefined)).toBe(MANAGEMENT_DASHBOARD_PATH);
    expect(resolvePostLoginPath('SUPER_ADMIN', null)).toBe(MANAGEMENT_DASHBOARD_PATH);
    expect(resolvePostLoginPath('SUPER_ADMIN', '')).toBe(MANAGEMENT_DASHBOARD_PATH);
    expect(resolvePostLoginPath('SUPER_ADMIN', 'https://evil.example/x')).toBe(
      MANAGEMENT_DASHBOARD_PATH,
    );
  });

  it('refuses a customer path for a management role', () => {
    expect(resolvePostLoginPath('SUPER_ADMIN', '/customer/orders')).toBe(
      MANAGEMENT_DASHBOARD_PATH,
    );
    expect(resolvePostLoginPath('BRANCH_MANAGER', '/customer/cart')).toBe(
      MANAGEMENT_DASHBOARD_PATH,
    );
  });
});

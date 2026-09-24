import type { UserRole } from '@hungrybox/shared';

export const ROLE_HOME_PATHS: Record<UserRole, string> = {
  SUPER_ADMIN: '/admin',
  BRANCH_MANAGER: '/manager',
  DELIVERY_PARTNER: '/delivery',
  CUSTOMER: '/customer',
} as const;

export const DEFAULT_HOME_PATH = '/';

export function homePathForRole(role: UserRole | null | undefined): string {
  return role ? ROLE_HOME_PATHS[role] : DEFAULT_HOME_PATH;
}

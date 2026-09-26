import type { UserRole } from '@hungrybox/shared';
import { ADMIN_BASE_PATH, MANAGER_BASE_PATH } from '../routes/paths';

export const ROLE_HOME_PATHS: Record<UserRole, string> = {
  SUPER_ADMIN: ADMIN_BASE_PATH,
  BRANCH_MANAGER: MANAGER_BASE_PATH,
  DELIVERY_PARTNER: '/delivery',
  CUSTOMER: '/customer',
} as const;

export const DEFAULT_HOME_PATH = '/';

export function homePathForRole(role: UserRole | null | undefined): string {
  return role ? ROLE_HOME_PATHS[role] : DEFAULT_HOME_PATH;
}

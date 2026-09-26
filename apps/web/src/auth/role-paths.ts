import type { UserRole } from '@hungrybox/shared';
import {
  ADMIN_AUDIT_PATH,
  ADMIN_BRANCHES_PATH,
  ADMIN_CATALOGUE_PATH,
  ADMIN_MANAGERS_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_PARTNERS_PATH,
  ADMIN_REPORTS_PATH,
  BRANCH_ASSIGNMENTS_PATH,
  BRANCH_AUDIT_PATH,
  BRANCH_CATALOGUE_PATH,
  BRANCH_ORDERS_PATH,
  BRANCH_PARTNERS_PATH,
  BRANCH_SETTINGS_PATH,
  MANAGEMENT_BASE_PATH,
  MANAGEMENT_DASHBOARD_PATH,
} from '../routes/paths';

export const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER'] as const;

export type ManagementRole = (typeof MANAGEMENT_ROLES)[number];

/**
 * Both management roles share one dashboard URL; the authenticated role decides
 * which dashboard renders. This is intentional and is why the per-role home
 * paths are not all distinct.
 */
export const ROLE_HOME_PATHS: Record<UserRole, string> = {
  SUPER_ADMIN: MANAGEMENT_DASHBOARD_PATH,
  BRANCH_MANAGER: MANAGEMENT_DASHBOARD_PATH,
  DELIVERY_PARTNER: '/delivery',
  CUSTOMER: '/customer',
} as const;

export const DEFAULT_HOME_PATH = '/';

const SUPER_ADMIN_SEGMENTS: readonly string[] = [
  ADMIN_BRANCHES_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_CATALOGUE_PATH,
  ADMIN_MANAGERS_PATH,
  ADMIN_PARTNERS_PATH,
  ADMIN_AUDIT_PATH,
  ADMIN_REPORTS_PATH,
];

const BRANCH_MANAGER_SEGMENTS: readonly string[] = [
  BRANCH_ORDERS_PATH,
  BRANCH_CATALOGUE_PATH,
  BRANCH_PARTNERS_PATH,
  BRANCH_ASSIGNMENTS_PATH,
  BRANCH_SETTINGS_PATH,
  BRANCH_AUDIT_PATH,
];

export function homePathForRole(role: UserRole | null | undefined): string {
  return role ? ROLE_HOME_PATHS[role] : DEFAULT_HOME_PATH;
}

export function isManagementRole(role: UserRole | null | undefined): role is ManagementRole {
  return role === 'SUPER_ADMIN' || role === 'BRANCH_MANAGER';
}

function matchesSegment(pathname: string, segment: string): boolean {
  return pathname === segment || pathname.startsWith(`${segment}/`);
}

/**
 * Client-side mirror of the management route table, used only to keep a
 * post-login redirect inside the signed-in role's own area. It never grants
 * access: the API RolesGuard and BranchScopeGuard remain authoritative.
 */
export function canRoleAccessPath(role: UserRole, pathname: string): boolean {
  if (!isManagementRole(role)) {
    return false;
  }
  if (pathname === MANAGEMENT_DASHBOARD_PATH || pathname === MANAGEMENT_BASE_PATH) {
    return true;
  }
  if (role === 'SUPER_ADMIN') {
    return SUPER_ADMIN_SEGMENTS.some((segment) => matchesSegment(pathname, segment));
  }
  return BRANCH_MANAGER_SEGMENTS.some((segment) => matchesSegment(pathname, segment));
}

/**
 * Decides where a freshly authenticated user lands. A deep link is honoured only
 * when the authenticated role may actually use it, so a Branch Manager can never
 * be dropped onto a Super Admin page (and vice versa) by a stale bookmark.
 */
export function resolvePostLoginPath(
  role: UserRole,
  from: string | null | undefined,
): string {
  const home = homePathForRole(role);
  if (!isManagementRole(role)) return home;
  if (!from || !from.startsWith('/')) return home;
  if (from === MANAGEMENT_BASE_PATH || from === MANAGEMENT_DASHBOARD_PATH) return home;
  if (!canRoleAccessPath(role, from)) return home;
  return from;
}

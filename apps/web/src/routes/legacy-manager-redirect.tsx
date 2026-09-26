import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthLoadingScreen } from '../auth/route-guards';
import { useAuth } from '../auth/auth-context';
import { homePathForRole } from '../auth/role-paths';
import {
  BRANCH_ASSIGNMENTS_PATH,
  BRANCH_AUDIT_PATH,
  BRANCH_CATALOGUE_PATH,
  BRANCH_ORDERS_PATH,
  BRANCH_PARTNERS_PATH,
  BRANCH_SETTINGS_PATH,
  LEGACY_MANAGER_ASSIGNMENTS_PATH,
  LEGACY_MANAGER_AUDIT_PATH,
  LEGACY_MANAGER_BASE_PATH,
  LEGACY_MANAGER_CATALOG_PATH,
  LEGACY_MANAGER_ORDERS_PATH,
  LEGACY_MANAGER_PARTNERS_PATH,
  LEGACY_MANAGER_SETTINGS_PATH,
  MANAGEMENT_BASE_PATH,
  MANAGEMENT_DASHBOARD_PATH,
} from './paths';

const LEGACY_SEGMENT_MAP: ReadonlyArray<readonly [string, string]> = [
  [LEGACY_MANAGER_ORDERS_PATH, BRANCH_ORDERS_PATH],
  [LEGACY_MANAGER_CATALOG_PATH, BRANCH_CATALOGUE_PATH],
  [LEGACY_MANAGER_PARTNERS_PATH, BRANCH_PARTNERS_PATH],
  [LEGACY_MANAGER_ASSIGNMENTS_PATH, BRANCH_ASSIGNMENTS_PATH],
  [LEGACY_MANAGER_SETTINGS_PATH, BRANCH_SETTINGS_PATH],
  [LEGACY_MANAGER_AUDIT_PATH, BRANCH_AUDIT_PATH],
  // Defensive alias: the management segment is "catalogue", the legacy one "catalog".
  ['/manager/catalogue', BRANCH_CATALOGUE_PATH],
];

/**
 * Maps a legacy `/manager...` pathname onto its `/admin/branch...` equivalent,
 * preserving trailing detail segments such as an order or partner id.
 * Returns null when the legacy path has no known equivalent.
 */
export function mapLegacyManagerPath(pathname: string): string | null {
  if (pathname === LEGACY_MANAGER_BASE_PATH || pathname === `${LEGACY_MANAGER_BASE_PATH}/`) {
    return MANAGEMENT_DASHBOARD_PATH;
  }
  for (const [legacyPath, target] of LEGACY_SEGMENT_MAP) {
    if (pathname === legacyPath) {
      return target;
    }
    if (pathname.startsWith(`${legacyPath}/`)) {
      return `${target}${pathname.slice(legacyPath.length)}`;
    }
  }
  return null;
}

/**
 * Redirect-only handler for the retired `/manager` entry. It deliberately renders
 * no login screen of its own: unauthenticated visitors are sent to the `/admin`
 * management login carrying their destination, so there is exactly one management
 * login experience and no redirect loop.
 */
export function LegacyManagerRedirect(): JSX.Element {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <AuthLoadingScreen />;
  }

  const target = mapLegacyManagerPath(location.pathname);

  if (!user) {
    return (
      <Navigate
        to={MANAGEMENT_BASE_PATH}
        replace
        state={{ from: target ?? MANAGEMENT_DASHBOARD_PATH }}
      />
    );
  }
  if (user.role !== 'BRANCH_MANAGER') {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  if (!target) {
    return <Navigate to={MANAGEMENT_DASHBOARD_PATH} replace />;
  }
  return <Navigate to={target} replace />;
}

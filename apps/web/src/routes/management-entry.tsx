import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthLoadingScreen } from '../auth/route-guards';
import { useAuth } from '../auth/auth-context';
import { homePathForRole, isManagementRole } from '../auth/role-paths';
import { MANAGEMENT_BASE_PATH, MANAGEMENT_DASHBOARD_PATH } from './paths';
import AdminOverviewPage from '../pages/admin/AdminOverviewPage';
import ManagerHomePage from '../pages/manager/ManagerHomePage';
import ManagementLoginPage from '../pages/admin/ManagementLoginPage';

/**
 * The single management entry point. Unauthenticated visitors get the management
 * login; authenticated management roles are forwarded to the role-aware dashboard;
 * any other role is refused management access and returned to its own area.
 */
export function ManagementEntry(): JSX.Element {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <AuthLoadingScreen />;
  }
  if (!user) {
    return <ManagementLoginPage />;
  }
  if (!isManagementRole(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return <Navigate to={MANAGEMENT_DASHBOARD_PATH} replace />;
}

/**
 * Role-aware management home. The authenticated role selects the dashboard, so
 * neither role can be shown the other's experience by navigating directly.
 */
export function ManagementDashboard(): JSX.Element {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <AuthLoadingScreen />;
  }
  if (!user) {
    return (
      <Navigate
        to={MANAGEMENT_BASE_PATH}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (user.role === 'SUPER_ADMIN') {
    return <AdminOverviewPage />;
  }
  if (user.role === 'BRANCH_MANAGER') {
    return <ManagerHomePage />;
  }
  return <Navigate to={homePathForRole(user.role)} replace />;
}

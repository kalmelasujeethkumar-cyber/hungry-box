import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@hungrybox/shared';
import { LOGIN_PATH } from '../routes/paths';
import { useAuth } from './auth-context';
import { homePathForRole } from './role-paths';

export function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-medium text-brand-navy">Checking session…</p>
      </main>
    );
  }
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function RequireRole({
  roles,
  children,
}: {
  roles: readonly UserRole[];
  children: ReactElement;
}): ReactElement {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to={LOGIN_PATH} replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return children;
}

export function PublicOnly({ children }: { children: ReactElement }): ReactElement {
  const { user } = useAuth();
  if (user) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return children;
}

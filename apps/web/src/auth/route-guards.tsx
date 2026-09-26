import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@hungrybox/shared';
import { LOGIN_PATH } from '../routes/paths';
import { useAuth } from './auth-context';
import { homePathForRole } from './role-paths';

export function AuthLoadingScreen(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm font-medium text-brand-navy">Checking session…</p>
    </main>
  );
}

export function RequireAuth({
  children,
  loginPath = LOGIN_PATH,
}: {
  children: ReactElement;
  loginPath?: string;
}): ReactElement {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <AuthLoadingScreen />;
  }
  if (!user) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function RequireRole({
  roles,
  children,
  loginPath = LOGIN_PATH,
}: {
  roles: readonly UserRole[];
  children: ReactElement;
  loginPath?: string;
}): ReactElement {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to={loginPath} replace />;
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

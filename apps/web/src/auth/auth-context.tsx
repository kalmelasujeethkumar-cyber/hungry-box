import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@hungrybox/shared';
import { authApi } from '../api/client';
import { clearSession, loadSession, saveSession } from './session-storage';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  initializing: boolean;
  login: (loginId: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession(): Promise<void> {
      const session = loadSession();
      if (!session) {
        if (!cancelled) setInitializing(false);
        return;
      }
      try {
        const fresh = await authApi.me(session.token);
        if (cancelled) return;
        setUser(fresh);
        setToken(session.token);
        saveSession({ token: session.token, user: fresh });
      } catch {
        clearSession();
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (loginId: string, password: string): Promise<AuthUser> => {
    const response = await authApi.login(loginId, password);
    setUser(response.user);
    setToken(response.accessToken);
    saveSession({ token: response.accessToken, user: response.user });
    return response.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, initializing, login, logout }),
    [user, token, initializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

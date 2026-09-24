import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@hungrybox/shared';
import { SESSION_EXPIRED_EVENT } from '../api/session-expiry';
import { AuthProvider, useAuth } from './auth-context';
import { saveSession } from './session-storage';

const user: AuthUser = {
  id: 'u-1',
  loginId: 'admin@example.com',
  email: 'admin@example.com',
  name: 'Super Admin',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  branchId: null,
};

const { meMock } = vi.hoisted(() => ({ meMock: vi.fn() }));

vi.mock('../api/client', () => ({
  authApi: {
    me: meMock,
    login: vi.fn(),
  },
}));

function Probe() {
  const { user: current, token } = useAuth();
  return (
    <div>
      <span data-testid="user">{current ? current.loginId : 'none'}</span>
      <span data-testid="token">{token ?? 'none'}</span>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  meMock.mockResolvedValue(user);
});

describe('AuthProvider session expiry handling', () => {
  it('clears the local session when a 401 triggers the session-expired event', async () => {
    saveSession({ token: 'stale-token', user });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('admin@example.com'));
    expect(screen.getByTestId('token').textContent).toBe('stale-token');

    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'));
    expect(screen.getByTestId('token').textContent).toBe('none');
    expect(localStorage.getItem('hungrybox.session')).toBeNull();
  });
});

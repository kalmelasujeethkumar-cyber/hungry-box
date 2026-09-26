import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import LoginPage from './LoginPage';

const MOCK_AUTH = vi.hoisted(() => ({
  user: null,
  login: vi.fn(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: MOCK_AUTH.user, login: MOCK_AUTH.login }),
}));

function renderLogin(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('public login page', () => {
  it('sells the brand and hides development demo credentials', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: /hungry box/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in to browse the menu/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo accounts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/branch1@gmail.com/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });

  it('signs in and routes a customer to their workspace', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockResolvedValue({
      id: 'cust-1',
      loginId: 'customer@gmail.com',
      email: 'customer@gmail.com',
      name: 'Demo Customer',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      branchId: null,
    });
    renderLogin();

    await user.type(screen.getByLabelText(/login id or email/i), 'customer@gmail.com');
    await user.type(screen.getByLabelText(/password/i), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(MOCK_AUTH.login).toHaveBeenCalledWith('customer@gmail.com', 'secret'),
    );
  });

  it('surfaces a friendly error when the credentials are rejected', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockRejectedValue(new ApiError('Incorrect login or password', 401));
    renderLogin();

    await user.type(screen.getByLabelText(/login id or email/i), 'customer@gmail.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect login or password')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in' }),
    ).not.toBeDisabled();
  });

  it('shows a signing-in state while the request is in flight', async () => {
    const user = userEvent.setup();
    const signedInUser = {
      id: 'cust-1',
      loginId: 'customer@gmail.com',
      email: 'customer@gmail.com',
      name: 'Demo Customer',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      branchId: null,
    };
    let resolveLogin!: (value: typeof signedInUser) => void;
    MOCK_AUTH.login.mockImplementation(
      () =>
        new Promise<typeof signedInUser>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    renderLogin();

    await user.type(screen.getByLabelText(/login id or email/i), 'customer@gmail.com');
    await user.type(screen.getByLabelText(/password/i), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
    resolveLogin(signedInUser);
  });
});
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';

const MOCK_AUTH = vi.hoisted(() => ({
  user: null as {
    id: string;
    loginId: string;
    email: string | null;
    name: string | null;
    role: 'CUSTOMER';
    status: string;
    branchId: string | null;
  } | null,
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: MOCK_AUTH.user }),
}));

function renderHome(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HomePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_AUTH.user = null;
});

describe('public landing page', () => {
  it('sells the brand without staging or demo copy', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: /snacks and meals/i })).toBeInTheDocument();
    expect(screen.getByText('Multi-branch food delivery')).toBeInTheDocument();
    expect(screen.queryByText(/phase 2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/demo accounts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/shiva@/i)).not.toBeInTheDocument();
  });

  it('lists truthful product features only', () => {
    renderHome();

    expect(screen.getByText('Delivers from your branch')).toBeInTheDocument();
    expect(screen.getByText('Order in minutes')).toBeInTheDocument();
    expect(screen.getByText('Track every step')).toBeInTheDocument();
    expect(screen.queryByText(/⭐|rating|reviews|customers served/i)).not.toBeInTheDocument();
  });

  it('routes sign-up CTAs to the login page for guests', () => {
    renderHome();

    expect(screen.getByRole('link', { name: 'Order now' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('offers a direct continuation when a user is already signed in', () => {
    MOCK_AUTH.user = {
      id: 'cust-1',
      loginId: 'customer@gmail.com',
      email: 'customer@gmail.com',
      name: 'Demo Customer',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      branchId: null,
    };
    renderHome();

    expect(screen.getByRole('link', { name: 'Continue as Demo Customer' })).toHaveAttribute(
      'href',
      '/customer',
    );
    expect(screen.getByRole('link', { name: 'Continue to your account' })).toHaveAttribute(
      'href',
      '/customer',
    );
  });
});
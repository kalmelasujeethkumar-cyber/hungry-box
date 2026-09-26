import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignOutButton } from './SignOutButton';

const MOCK_AUTH = vi.hoisted(() => ({
  logout: vi.fn(),
  user: null,
  token: null,
  initializing: false,
  login: vi.fn(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));

describe('SignOutButton', () => {
  it('signs the user out on click', async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(MOCK_AUTH.logout).toHaveBeenCalledTimes(1);
  });

  it('supports a custom label', () => {
    render(<SignOutButton label="Log out" />);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });
});
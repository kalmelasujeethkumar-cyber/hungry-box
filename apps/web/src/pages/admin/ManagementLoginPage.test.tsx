import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ManagementLoginPage from './ManagementLoginPage';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => MOCK_AUTH }));

const MOCK_AUTH = vi.hoisted(() => ({
  user: null,
  token: null,
  initializing: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

/** Fresh flag storage per test so one test's notice cannot leak into the next. */
function seedExpiredFlag(): void {
  sessionStorage.setItem('hungrybox.session-expired', '1');
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <ManagementLoginPage />
    </MemoryRouter>,
  );
}

describe('management login session-expiry notice', () => {
  it('tells the user why they are back at the login screen', async () => {
    seedExpiredFlag();
    renderPage();

    expect(await screen.findByText(/your session has expired/i)).toBeInTheDocument();
  });

  it('says nothing on an ordinary sign-in visit', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    expect(screen.queryByText(/your session has expired/i)).not.toBeInTheDocument();
  });

  it('does not repeat the notice after one visit', async () => {
    seedExpiredFlag();
    const first = render(
      <MemoryRouter>
        <ManagementLoginPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/your session has expired/i)).toBeInTheDocument();
    first.unmount();

    /**
     * The flag is consumed, so returning to the login page later for an unrelated reason
     * must not accuse the user of a session problem they are not having.
     */
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    expect(screen.queryByText(/your session has expired/i)).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { AuthUser } from '@hungrybox/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouteConfig } from './AppRoutes';
import { mapLegacyManagerPath } from './legacy-manager-redirect';
import { ApiError } from '../api/client';

const MOCK_AUTH = vi.hoisted(() => ({
  user: null as AuthUser | null,
  initializing: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    user: MOCK_AUTH.user,
    token: MOCK_AUTH.user ? 'test-token' : null,
    initializing: MOCK_AUTH.initializing,
    login: MOCK_AUTH.login,
    logout: MOCK_AUTH.logout,
  }),
}));

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {},
  adminApi: { dashboard: vi.fn().mockResolvedValue(null) },
  branchesApi: { list: vi.fn().mockResolvedValue([]) },
  branchOrdersApi: { list: vi.fn().mockResolvedValue([]) },
  branchSettingsApi: { get: vi.fn().mockResolvedValue(null) },
}));

const SUPER_ADMIN: AuthUser = {
  id: 'u-admin',
  loginId: 'admin@gmail.com',
  email: 'admin@gmail.com',
  name: 'Super Admin',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  branchId: null,
};

const BRANCH_MANAGER: AuthUser = {
  id: 'u-manager',
  loginId: 'branch1@gmail.com',
  email: 'branch1@gmail.com',
  name: 'Branch Manager',
  role: 'BRANCH_MANAGER',
  status: 'ACTIVE',
  branchId: 'branch-guntur',
};

const CUSTOMER: AuthUser = {
  id: 'u-customer',
  loginId: 'customer@gmail.com',
  email: 'customer@gmail.com',
  name: 'Demo Customer',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  branchId: null,
};

const DELIVERY_PARTNER: AuthUser = {
  id: 'u-partner',
  loginId: 'shiva@',
  email: null,
  name: 'Shiva',
  role: 'DELIVERY_PARTNER',
  status: 'ACTIVE',
  branchId: 'branch-guntur',
};

function renderAt(path: string) {
  const router = createMemoryRouter(appRouteConfig, { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}

function currentPath(router: ReturnType<typeof createMemoryRouter>): string {
  return router.state.location.pathname;
}

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_AUTH.user = null;
  MOCK_AUTH.initializing = false;
});

describe('management entry', () => {
  it('1. shows the management login to an unauthenticated visitor at /admin', async () => {
    const { router } = renderAt('/admin');

    expect(await screen.findByRole('heading', { name: /hungry box/i })).toBeInTheDocument();
    expect(screen.getByText(/hungry box management/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/management email or username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin');
  });

  it('never exposes development demo credentials or repo instructions', () => {
    renderAt('/admin');

    expect(screen.queryByText(/demo accounts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/branch1@gmail.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/456654|456456|789789|20252025/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AGENTS\.md|npm run|seed/i)).not.toBeInTheDocument();
  });

  it('gives the login form accessible labels, autocomplete and keyboard submission', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockResolvedValue(SUPER_ADMIN);
    renderAt('/admin');

    const loginField = await screen.findByLabelText(/management email or username/i);
    const passwordField = screen.getByLabelText(/^password/i);
    expect(loginField).toHaveAttribute('autocomplete', 'username');
    expect(passwordField).toHaveAttribute('autocomplete', 'current-password');

    await user.type(loginField, 'admin@gmail.com');
    await user.type(passwordField, 'secret{Enter}');

    await waitFor(() =>
      expect(MOCK_AUTH.login).toHaveBeenCalledWith('admin@gmail.com', 'secret'),
    );
  });

  it('11. shows a safe error for invalid credentials and re-enables the form', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockRejectedValue(new ApiError('Invalid credentials', 401));
    renderAt('/admin');

    await user.type(await screen.findByLabelText(/management email or username/i), 'admin@gmail.com');
    await user.type(screen.getByLabelText(/^password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(MOCK_AUTH.logout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled());
  });

  it('shows a signing-in state while the request is in flight', async () => {
    const user = userEvent.setup();
    let release!: (value: AuthUser) => void;
    MOCK_AUTH.login.mockImplementation(
      () =>
        new Promise<AuthUser>((resolve) => {
          release = resolve;
        }),
    );
    renderAt('/admin');

    await user.type(await screen.findByLabelText(/management email or username/i), 'admin@gmail.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled();
    release(SUPER_ADMIN);
  });

  it('2. routes a valid SUPER_ADMIN login to the Super Admin dashboard', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockImplementation(async () => {
      MOCK_AUTH.user = SUPER_ADMIN;
      return SUPER_ADMIN;
    });
    const { router } = renderAt('/admin');

    await user.type(await screen.findByLabelText(/management email or username/i), 'admin@gmail.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/global operations/i)).toBeInTheDocument();
    expect(screen.queryByText(/branch operations/i)).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin/dashboard');
  });

  it('3. routes a valid BRANCH_MANAGER login to the Branch Manager dashboard', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockImplementation(async () => {
      MOCK_AUTH.user = BRANCH_MANAGER;
      return BRANCH_MANAGER;
    });
    const { router } = renderAt('/admin');

    await user.type(await screen.findByLabelText(/management email or username/i), 'branch1@gmail.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/branch operations/i)).toBeInTheDocument();
    expect(screen.queryByText(/global operations/i)).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin/dashboard');
  });

  it('7. restores a Super Admin session straight to the dashboard, with no login flash', async () => {
    MOCK_AUTH.user = SUPER_ADMIN;
    const { router } = renderAt('/admin');

    expect(await screen.findByText(/global operations/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/management email or username/i)).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin/dashboard');
  });

  it('8. restores a Branch Manager session straight to the dashboard, with no login flash', async () => {
    MOCK_AUTH.user = BRANCH_MANAGER;
    const { router } = renderAt('/admin');

    expect(await screen.findByText(/branch operations/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/management email or username/i)).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin/dashboard');
  });

  it('shows a loading state while the session is being restored', async () => {
    MOCK_AUTH.initializing = true;
    renderAt('/admin/dashboard');

    expect(await screen.findByText(/checking session/i)).toBeInTheDocument();
  });

  it('4. refuses management access to a CUSTOMER and returns them to their own area', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockImplementation(async () => {
      MOCK_AUTH.user = CUSTOMER;
      return CUSTOMER;
    });
    const { router } = renderAt('/admin');

    await user.type(await screen.findByLabelText(/management email or username/i), 'customer@gmail.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/not authorized for hungry box management/i)).toBeInTheDocument();
    expect(MOCK_AUTH.logout).toHaveBeenCalled();
    expect(screen.queryByText(/global operations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/branch operations/i)).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin');
  });

  it('5. refuses management access to a DELIVERY_PARTNER and returns them to their own area', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockImplementation(async () => {
      MOCK_AUTH.user = DELIVERY_PARTNER;
      return DELIVERY_PARTNER;
    });
    const { router } = renderAt('/admin');

    await user.type(await screen.findByLabelText(/management email or username/i), 'shiva@');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/not authorized for hungry box management/i)).toBeInTheDocument();
    expect(MOCK_AUTH.logout).toHaveBeenCalled();
    expect(screen.queryByText(/global operations/i)).not.toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin');
  });

  it('sends an already-authenticated non-management role away from /admin', async () => {
    MOCK_AUTH.user = CUSTOMER;
    const { router } = renderAt('/admin');

    await waitFor(() => expect(currentPath(router)).toBe('/customer/storefront'));
    expect(screen.queryByText(/global operations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/branch operations/i)).not.toBeInTheDocument();
  });
});

describe('management route protection', () => {
  it('6. stops a Branch Manager from rendering a Super Admin-only route', async () => {
    MOCK_AUTH.user = BRANCH_MANAGER;
    const { router } = renderAt('/admin/orders');

    await waitFor(() => expect(currentPath(router)).toBe('/admin/dashboard'));
    expect(await screen.findByText(/branch operations/i)).toBeInTheDocument();
    expect(screen.queryByText(/global operations/i)).not.toBeInTheDocument();
  });

  it('stops a Branch Manager from every Super Admin-only segment', async () => {
    for (const path of [
      '/admin/branches',
      '/admin/orders',
      '/admin/catalogue',
      '/admin/managers',
      '/admin/partners',
      '/admin/audit',
      '/admin/reports',
    ]) {
      MOCK_AUTH.user = BRANCH_MANAGER;
      const { router, unmount } = renderAt(path);
      await waitFor(() => expect(currentPath(router)).toBe('/admin/dashboard'));
      unmount();
    }
  });

  it('stops a Super Admin from Branch Manager-only segments', async () => {
    MOCK_AUTH.user = SUPER_ADMIN;
    const { router } = renderAt('/admin/branch/orders');

    await waitFor(() => expect(currentPath(router)).toBe('/admin/dashboard'));
    expect(await screen.findByText(/global operations/i)).toBeInTheDocument();
  });

  it('stops a CUSTOMER from Branch Manager segments', async () => {
    MOCK_AUTH.user = CUSTOMER;
    const { router } = renderAt('/admin/branch/orders');

    await waitFor(() => expect(currentPath(router)).toBe('/customer/storefront'));
  });

  it('13. sends an unauthenticated deep link to the management login and back again', async () => {
    const { router } = renderAt('/admin/branch/orders');

    expect(await screen.findByRole('heading', { name: /hungry box/i })).toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin');
  });

  it('13. honours a permitted deep link after login', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockImplementation(async () => {
      MOCK_AUTH.user = BRANCH_MANAGER;
      return BRANCH_MANAGER;
    });
    const { router } = renderAt('/admin/branch/orders');

    await user.type(await screen.findByLabelText(/management email or username/i), 'branch1@gmail.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(currentPath(router)).toBe('/admin/branch/orders'));
  });

  it('does not let a wrong-role deep link drop a user on the other dashboard', async () => {
    const user = userEvent.setup();
    MOCK_AUTH.login.mockImplementation(async () => {
      MOCK_AUTH.user = BRANCH_MANAGER;
      return BRANCH_MANAGER;
    });
    // A stale Super Admin bookmark.
    const { router } = renderAt('/admin/reports');

    await user.type(await screen.findByLabelText(/management email or username/i), 'branch1@gmail.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(currentPath(router)).toBe('/admin/dashboard'));
    expect(await screen.findByText(/branch operations/i)).toBeInTheDocument();
  });

  it('10. signs a management user out and returns them to the management login', async () => {
    MOCK_AUTH.user = SUPER_ADMIN;
    const signedIn = renderAt('/admin/dashboard');

    expect(await screen.findByText(/global operations/i)).toBeInTheDocument();
    await userEvent.setup().click(await screen.findByRole('button', { name: /sign out/i }));
    expect(MOCK_AUTH.logout).toHaveBeenCalledTimes(1);
    signedIn.unmount();

    // Signed out, the same protected URL must resolve to the management login.
    MOCK_AUTH.user = null;
    const signedOut = renderAt('/admin/dashboard');

    expect(await screen.findByRole('heading', { name: /hungry box/i })).toBeInTheDocument();
    expect(screen.getByText(/hungry box management/i)).toBeInTheDocument();
    expect(currentPath(signedOut.router)).toBe('/admin');
  });
});

describe('legacy /manager handling', () => {
  it('9. maps every legacy manager URL to its /admin/branch equivalent', () => {
    expect(mapLegacyManagerPath('/manager')).toBe('/admin/dashboard');
    expect(mapLegacyManagerPath('/manager/orders')).toBe('/admin/branch/orders');
    expect(mapLegacyManagerPath('/manager/orders/ord-1')).toBe('/admin/branch/orders/ord-1');
    expect(mapLegacyManagerPath('/manager/catalog')).toBe('/admin/branch/catalogue');
    expect(mapLegacyManagerPath('/manager/partners')).toBe('/admin/branch/partners');
    expect(mapLegacyManagerPath('/manager/partners/dp-1')).toBe('/admin/branch/partners/dp-1');
    expect(mapLegacyManagerPath('/manager/assignments')).toBe('/admin/branch/assignments');
    expect(mapLegacyManagerPath('/manager/settings')).toBe('/admin/branch/settings');
    expect(mapLegacyManagerPath('/manager/audit')).toBe('/admin/branch/audit');
  });

  it('returns null for paths with no known equivalent', () => {
    expect(mapLegacyManagerPath('/manager/unknown')).toBeNull();
    expect(mapLegacyManagerPath('/admin/orders')).toBeNull();
  });

  it('9. forwards an authenticated Branch Manager from a legacy deep link', async () => {
    MOCK_AUTH.user = BRANCH_MANAGER;
    const { router } = renderAt('/manager/orders/ord-9');

    await waitFor(() => expect(currentPath(router)).toBe('/admin/branch/orders/ord-9'));
  });

  it('9. sends the legacy entry to the management dashboard for a Branch Manager', async () => {
    MOCK_AUTH.user = BRANCH_MANAGER;
    const { router } = renderAt('/manager');

    await waitFor(() => expect(currentPath(router)).toBe('/admin/dashboard'));
  });

  it('9. sends an unauthenticated legacy URL to the management login, never a second login', async () => {
    const { router } = renderAt('/manager/orders');

    expect(await screen.findByRole('heading', { name: /hungry box/i })).toBeInTheDocument();
    expect(screen.getByText(/hungry box management/i)).toBeInTheDocument();
    expect(currentPath(router)).toBe('/admin');
  });

  it('9. refuses a legacy manager URL to a non-management role', async () => {
    MOCK_AUTH.user = CUSTOMER;
    const { router } = renderAt('/manager/orders');

    await waitFor(() => expect(currentPath(router)).toBe('/customer/storefront'));
  });

  it('12. settles instead of looping on a legacy URL', async () => {
    MOCK_AUTH.user = BRANCH_MANAGER;
    const { router } = renderAt('/manager/orders');
    await waitFor(() => expect(currentPath(router)).toBe('/admin/branch/orders'));

    const settled = currentPath(router);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(currentPath(router)).toBe(settled);
  });

  it('12. settles instead of looping on the management entry', async () => {
    MOCK_AUTH.user = SUPER_ADMIN;
    const { router } = renderAt('/admin');
    await waitFor(() => expect(currentPath(router)).toBe('/admin/dashboard'));

    const settled = currentPath(router);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(currentPath(router)).toBe(settled);
  });
});

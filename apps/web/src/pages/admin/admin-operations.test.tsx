import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuditListResultDto,
  BranchDto,
  DashboardSummaryDto,
  DeliveryPartnerListItemDto,
  KycListItemDto,
  OrderSummaryDto,
  UserListResultDto,
} from '@hungrybox/shared';
import AdminAuditPage from './AdminAuditPage';
import AdminBranchesPage from './AdminBranchesPage';
import AdminManagersPage from './AdminManagersPage';
import AdminOrdersPage from './AdminOrdersPage';
import AdminOverviewPage from './AdminOverviewPage';
import AdminPartnersPage from './AdminPartnersPage';
import AdminReportsPage from './AdminReportsPage';

const MOCK_AUTH = vi.hoisted(() => ({
  user: {
    id: 'adm-1',
    loginId: 'admin@gmail.com',
    email: 'admin@gmail.com',
    name: 'Super Admin',
    role: 'SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    branchId: null,
  },
  token: 'test-token',
  initializing: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

const MOCK_APIS = vi.hoisted(() => ({
  branchesApi: { list: vi.fn(), setStatus: vi.fn(), update: vi.fn() },
  usersApi: { list: vi.fn(), createManager: vi.fn(), setStatus: vi.fn() },
  productsApi: { list: vi.fn(), get: vi.fn() },
  categoriesApi: { list: vi.fn() },
  branchOrdersApi: { listGlobal: vi.fn() },
  branchDeliveryApi: { listPartners: vi.fn() },
  branchKycApi: { list: vi.fn(), documentAccess: vi.fn() },
  branchAuditApi: { list: vi.fn(), exportCsv: vi.fn() },
  adminApi: { dashboard: vi.fn(), ordersReportCsv: vi.fn() },
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly details: Record<string, unknown> | null;
    constructor(message: string, status: number, details: Record<string, unknown> | null = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  },
}));

vi.mock('../../api/client', () => MOCK_APIS);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const BRANCH_GUNTUR: BranchDto = {
  id: 'br-guntur',
  code: 'guntur',
  name: 'Hungry Box Guntur',
  city: 'Guntur',
  state: 'Andhra Pradesh',
  country: 'India',
  address: 'MG Road, Guntur',
  latitude: 16.3067,
  longitude: 80.4365,
  deliveryRadiusKm: 10,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const BRANCH_HYDERABAD: BranchDto = {
  ...BRANCH_GUNTUR,
  id: 'br-hyd',
  code: 'hyd',
  name: 'Hungry Box Hyderabad',
  city: 'Hyderabad',
  latitude: 17.385,
  longitude: 78.4867,
  status: 'PAUSED',
};

function dashboard(overrides: Partial<DashboardSummaryDto> = {}): DashboardSummaryDto {
  return {
    revenueMinor: 2300000,
    orders: 12,
    customers: 3,
    averageOrderValueMinor: 191666,
    activeBranches: 1,
    pausedBranches: 1,
    inactiveBranches: 0,
    orderStatusBreakdown: [{ status: 'PLACED', count: 12, totalMinor: 2300000 }],
    paymentMethodBreakdown: [{ method: 'UPI', count: 10, totalMinor: 2000000 }],
    cod: {
      totalOrders: 4,
      collectedCount: 3,
      collectedMinor: 60000,
      uncollectedCount: 1,
      uncollectedMinor: 20000,
    },
    cancellations: { count: 1, amountMinor: 50000 },
    refunds: { count: 0, amountMinor: 0 },
    delivery: {
      activePartners: 4,
      assigned: 2,
      outForDelivery: 1,
      delivered: 5,
      cancelledOrRejected: 1,
    },
    branchComparison: [
      {
        branchId: 'br-guntur',
        branchName: 'Hungry Box Guntur',
        status: 'ACTIVE',
        orders: 12,
        revenueMinor: 2300000,
      },
    ],
    topProducts: [
      { productId: 'p-1', productName: 'Chicken Biryani', quantity: 6, revenueMinor: 1200000 },
    ],
    timeSeries: [
      {
        period: '2026-09-24',
        label: '24 Sep',
        orders: 12,
        revenueMinor: 2300000,
        cancelledOrders: 1,
      },
    ],
    ...overrides,
  };
}

function orderSummary(overrides: Partial<OrderSummaryDto> = {}): OrderSummaryDto {
  return {
    id: 'ord-1',
    orderNumber: 'HB-20260924-000001',
    status: 'PLACED',
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
    branch: BRANCH_GUNTUR,
    itemCount: 2,
    subtotalMinor: 40000,
    discountMinor: 0,
    deliveryFeeMinor: 3000,
    taxMinor: 0,
    totalMinor: 43000,
    placedAt: '2026-09-24T10:00:00.000Z',
    cancelledAt: null,
    ...overrides,
  };
}

function partner(overrides: Partial<DeliveryPartnerListItemDto> = {}): DeliveryPartnerListItemDto {
  return {
    id: 'dp-1',
    partnerId: 'DP-0001',
    fullName: 'Shiva Kumar',
    mobile: '9090909090',
    branch: { id: 'br-guntur', name: 'Hungry Box Guntur', code: 'guntur', city: 'Guntur' },
    status: 'ACTIVE',
    availability: 'ONLINE',
    activeDeliveryCount: 1,
    distanceKm: null,
    joinedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function managerResult(overrides: Partial<UserListResultDto> = {}): UserListResultDto {
  return {
    items: [
      {
        id: 'u-mgr',
        loginId: 'branch1@gmail.com',
        email: 'branch1@gmail.com',
        name: 'Branch Manager',
        role: 'BRANCH_MANAGER',
        status: 'ACTIVE',
        branchId: 'br-guntur',
        branchName: 'Hungry Box Guntur',
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 25,
    ...overrides,
  };
}

const AUDIT_RESULT: AuditListResultDto = {
  items: [
    {
      id: 'evt-1',
      actorRole: 'SUPER_ADMIN',
      actorId: 'adm-1',
      kind: 'BRANCH_UPDATED',
      entityType: 'branch',
      entityId: 'br-guntur',
      branchId: 'br-guntur',
      message: 'Branch delivery radius updated',
      createdAt: '2026-09-24T10:05:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 25,
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.branchesApi.list.mockResolvedValue([BRANCH_GUNTUR, BRANCH_HYDERABAD]);
  MOCK_APIS.branchesApi.setStatus.mockResolvedValue({ ...BRANCH_GUNTUR, status: 'PAUSED' });
  MOCK_APIS.branchesApi.update.mockResolvedValue({ ...BRANCH_GUNTUR, deliveryRadiusKm: 15 });
  MOCK_APIS.usersApi.list.mockResolvedValue(managerResult());
  MOCK_APIS.usersApi.createManager.mockResolvedValue({
    manager: {
      id: 'u-new',
      loginId: 'raju@',
      email: null,
      name: 'Raju',
      role: 'BRANCH_MANAGER',
      status: 'ACTIVE',
      branchId: 'br-guntur',
      branchName: 'Hungry Box Guntur',
      createdAt: '2026-09-24T00:00:00.000Z',
    },
    temporaryPassword: 'Temp@12345',
  });
  MOCK_APIS.adminApi.dashboard.mockResolvedValue(dashboard());
  MOCK_APIS.adminApi.ordersReportCsv.mockResolvedValue('orderNumber,totalMinor\nHB-1,43000');
  MOCK_APIS.branchOrdersApi.listGlobal.mockResolvedValue([orderSummary()]);
  MOCK_APIS.branchDeliveryApi.listPartners.mockResolvedValue([partner()]);
  MOCK_APIS.branchKycApi.list.mockResolvedValue([]);
  MOCK_APIS.branchAuditApi.list.mockResolvedValue(AUDIT_RESULT);
  MOCK_APIS.branchAuditApi.exportCsv.mockResolvedValue('id,createdAt\nevt-1,2026-09-24');
});

describe('admin overview', () => {
  it('renders global dashboard metrics from the analytics service', async () => {
    render(
      <MemoryRouter>
        <AdminOverviewPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('₹23,000')).length).toBeGreaterThan(0);
    expect(screen.getByText('Avg order value')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Revenue over time')).toBeInTheDocument();
    expect(screen.getByText('Revenue by branch')).toBeInTheDocument();
    await waitFor(() =>
      expect(MOCK_APIS.adminApi.dashboard).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'day' }),
        'test-token',
      ),
    );
  });

  it('filters the overview to a single branch', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminOverviewPage />
      </MemoryRouter>,
    );

    await screen.findByText('Revenue over time');
    const branchSelect = screen.getByLabelText('Branch');
    await user.selectOptions(branchSelect, 'br-guntur');

    await waitFor(() =>
      expect(MOCK_APIS.adminApi.dashboard).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 'br-guntur' }),
        'test-token',
      ),
    );
  });

  it('shows cash-on-delivery collection summaries', async () => {
    render(
      <MemoryRouter>
        <AdminOverviewPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cash-on-delivery orders')).toBeInTheDocument();
    expect(screen.getByText('Cash-on-delivery orders').previousElementSibling?.textContent).toBe(
      '4',
    );
    expect(screen.getByText('Cash collected · 3 orders')).toBeInTheDocument();
    expect(screen.getByText('₹600')).toBeInTheDocument();
    expect(screen.getByText('Cash pending · 1 orders')).toBeInTheDocument();
    expect(screen.getByText('₹200')).toBeInTheDocument();
  });
});

describe('admin branches', () => {
  it('lists all branches and pauses one after confirmation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminBranchesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Hungry Box Guntur')).toBeInTheDocument();
    expect(screen.getByText('Hungry Box Hyderabad')).toBeInTheDocument();
    expect(screen.getAllByText('10 km delivery radius').length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Pause' })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Paused Hungry Box Guntur?' });
    await user.click(within(dialog).getByRole('button', { name: 'Paused' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchesApi.setStatus).toHaveBeenCalledWith(
        'br-guntur',
        { status: 'PAUSED' },
        'test-token',
      ),
    );
    expect(await screen.findByText('Hungry Box Guntur marked as paused.')).toBeInTheDocument();
  });

  it('saves a delivery radius change for a branch', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminBranchesPage />
      </MemoryRouter>,
    );

    await screen.findByText('Hungry Box Guntur');
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    const radiusInput = screen.getByLabelText('Delivery radius (km)');
    await user.clear(radiusInput);
    await user.type(radiusInput, '15');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchesApi.update).toHaveBeenCalledWith(
        'br-guntur',
        expect.objectContaining({ deliveryRadiusKm: 15, address: 'MG Road, Guntur' }),
        'test-token',
      ),
    );
    expect(await screen.findByText('Branch settings saved.')).toBeInTheDocument();
  });
});

describe('admin managers', () => {
  it('lists branch managers with their assigned branch', async () => {
    render(
      <MemoryRouter>
        <AdminManagersPage />
      </MemoryRouter>,
    );

    const managerName = await screen.findByText('Branch Manager');
    expect(managerName).toBeInTheDocument();
    expect(screen.getByText('branch1@gmail.com')).toBeInTheDocument();
    const managerCard = managerName.closest('li');
    expect(managerCard).not.toBeNull();
    expect(within(managerCard as HTMLElement).getByText('Hungry Box Guntur')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 1 managers')).toBeInTheDocument();
    await waitFor(() =>
      expect(MOCK_APIS.usersApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'BRANCH_MANAGER', page: 1, limit: 25 }),
        'test-token',
      ),
    );
  });

  it('creates a manager and reveals the one-time password', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminManagersPage />
      </MemoryRouter>,
    );

    await screen.findByText('Branch Manager');
    await user.click(screen.getByRole('button', { name: 'Add manager' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add branch manager' });
    await user.type(within(dialog).getByLabelText('Full name'), 'Raju');
    await user.type(within(dialog).getByLabelText('Login id'), 'raju@');
    await user.selectOptions(within(dialog).getByLabelText('Branch'), 'br-guntur');
    await user.click(within(dialog).getByRole('button', { name: 'Create manager' }));

    await waitFor(() =>
      expect(MOCK_APIS.usersApi.createManager).toHaveBeenCalledWith(
        { name: 'Raju', loginId: 'raju@', branchId: 'br-guntur' },
        'test-token',
      ),
    );
    expect(await screen.findByText('Temp@12345')).toBeInTheDocument();
    expect(screen.getByText('One-time password')).toBeInTheDocument();
  });
});

describe('admin orders', () => {
  it('lists orders from every branch with branch name and totals', async () => {
    render(
      <MemoryRouter>
        <AdminOrdersPage />
      </MemoryRouter>,
    );

    const orderNumber = await screen.findByText('HB-20260924-000001');
    expect(orderNumber).toBeInTheDocument();
    const orderRow = orderNumber.closest('li');
    expect(orderRow).not.toBeNull();
    expect(within(orderRow as HTMLElement).getByText(/Hungry Box Guntur/)).toBeInTheDocument();
    expect(screen.getByText('₹430')).toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();
    await waitFor(() =>
      expect(MOCK_APIS.branchOrdersApi.listGlobal).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ branchId: undefined }),
      ),
    );
  });

  it('filters orders by branch', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminOrdersPage />
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260924-000001');
    await user.selectOptions(screen.getByLabelText('Branch'), 'br-hyd');

    await waitFor(() =>
      expect(MOCK_APIS.branchOrdersApi.listGlobal).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ branchId: 'br-hyd' }),
      ),
    );
  });
});

describe('admin partners', () => {
  it('lists delivery partners across branches', async () => {
    render(
      <MemoryRouter>
        <AdminPartnersPage />
      </MemoryRouter>,
    );

    const partnerName = await screen.findByText('Shiva Kumar');
    expect(partnerName).toBeInTheDocument();
    const partnerCard = partnerName.closest('li');
    expect(partnerCard).not.toBeNull();
    expect(within(partnerCard as HTMLElement).getByText(/Hungry Box Guntur/)).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Online')).toBeInTheDocument();
    await waitFor(() =>
      expect(MOCK_APIS.branchDeliveryApi.listPartners).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ branchId: undefined }),
      ),
    );
  });

  it('shows global KYC status and secure view links per partner', async () => {
    const kycItems: KycListItemDto[] = [
      {
        partnerId: 'DP-0001',
        fullName: 'Shiva Kumar',
        mobile: '9090909090',
        status: 'ACTIVE',
        overallState: 'AWAITING_REVIEW',
        hasAadhaar: true,
        hasDrivingLicense: false,
      },
    ];
    MOCK_APIS.branchKycApi.list.mockResolvedValue(kycItems);
    MOCK_APIS.branchKycApi.documentAccess.mockResolvedValue({
      url: 'signed-url',
      expiresAt: '2026-09-24T10:10:00.000Z',
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminPartnersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('KYC awaiting review')).toBeInTheDocument();
    expect(screen.getByText(/Aadhaar uploaded · licence missing/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aadhaar' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchKycApi.documentAccess).toHaveBeenCalledWith(
        'DP-0001',
        'AADHAAR',
        'test-token',
      ),
    );
  });
});

describe('admin audit log', () => {
  it('lists global events across branches', async () => {
    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('branch updated')).toBeInTheDocument();
    expect(screen.getByText('Branch delivery radius updated')).toBeInTheDocument();
    expect(screen.getByText(/branch br-guntur/)).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 1 events')).toBeInTheDocument();
  });

  it('exports the CSV for the current query', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:audit');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>,
    );

    await screen.findByText('branch updated');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchAuditApi.exportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
        'test-token',
      ),
    );
    vi.unstubAllGlobals();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });
});

describe('admin reports', () => {
  it('downloads the orders CSV report', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('₹23,000')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Download orders CSV' }));

    await waitFor(() =>
      expect(MOCK_APIS.adminApi.ordersReportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
        'test-token',
      ),
    );
    vi.unstubAllGlobals();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });
});

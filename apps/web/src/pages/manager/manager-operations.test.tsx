import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuditListResultDto,
  BranchDto,
  BranchProductDto,
  OrderDetailDto,
  OrderSummaryDto,
} from '@hungrybox/shared';
import ManagerOrdersPage from './ManagerOrdersPage';
import ManagerOrderDetailPage from './ManagerOrderDetailPage';
import ManagerCatalogPage from './ManagerCatalogPage';
import ManagerSettingsPage from './ManagerSettingsPage';
import ManagerAuditPage from './ManagerAuditPage';

const MOCK_AUTH = vi.hoisted(() => ({
  user: {
    id: 'mgr-1',
    loginId: 'branch1@gmail.com',
    email: 'branch1@gmail.com',
    name: 'Branch Manager',
    role: 'BRANCH_MANAGER' as const,
    status: 'ACTIVE' as const,
    branchId: 'br-guntur',
  },
  token: 'test-token',
  initializing: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

const MOCK_APIS = vi.hoisted(() => ({
  branchOrdersApi: {
    list: vi.fn(),
    get: vi.fn(),
    advanceStatus: vi.fn(),
    cancel: vi.fn(),
    collectCod: vi.fn(),
  },
  branchProductsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() },
  branchSettingsApi: { get: vi.fn(), update: vi.fn() },
  branchAuditApi: { list: vi.fn(), exportCsv: vi.fn() },
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

const BRANCH: BranchDto = {
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

function orderSummary(overrides: Partial<OrderSummaryDto> = {}): OrderSummaryDto {
  return {
    id: 'ord-1',
    orderNumber: 'HB-20260924-000001',
    status: 'PLACED',
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
    branch: BRANCH,
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

function orderDetail(overrides: Partial<OrderDetailDto> = {}): OrderDetailDto {
  return {
    ...orderSummary(),
    items: [
      {
        id: 'oi-1',
        productId: 'p-1',
        productName: 'Chicken Biryani',
        quantity: 1,
        unitPriceMinor: 29900,
        unitDiscountMinor: 2000,
        unitEffectivePriceMinor: 27900,
        lineSubtotalMinor: 29900,
        lineDiscountMinor: 2000,
        lineTotalMinor: 27900,
      },
    ],
    address: {
      id: 'addr-1',
      label: null,
      recipientName: 'Demo Customer',
      phone: '9090909090',
      houseFlat: '1-2',
      streetArea: 'Main Road',
      landmark: null,
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522001',
      latitude: null,
      longitude: null,
      deliveryInstructions: null,
    },
    payments: [
      {
        id: 'pay-1',
        provider: 'dev',
        providerPaymentId: 'dev_x',
        providerOrderId: null,
        method: 'UPI',
        status: 'PAID',
        amountMinor: 43000,
        currency: 'INR',
        collectedAt: null,
        collectedByRole: null,
        collectedById: null,
      },
    ],
    events: [
      {
        id: 'ev-1',
        kind: 'ORDER_CREATED',
        fromStatus: null,
        toStatus: 'PLACED',
        actorRole: 'CUSTOMER',
        at: '2026-09-24T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function branchProduct(overrides: Partial<BranchProductDto> = {}): BranchProductDto {
  return {
    id: 'bp-1',
    productId: 'p-1',
    priceMinor: 29900,
    discountMinor: 2000,
    effectivePriceMinor: 27900,
    isAvailable: true,
    status: 'ACTIVE',
    product: {
      name: 'Chicken Biryani',
      slug: 'chicken-biryani',
      categoryName: 'Biryani',
      categorySlug: 'biryani',
    },
    ...overrides,
  };
}

const AUDIT_RESULT: AuditListResultDto = {
  items: [
    {
      id: 'evt-1',
      actorRole: 'BRANCH_MANAGER',
      actorId: 'u-mgr',
      kind: 'BRANCH_PRODUCT_UPDATED',
      entityType: 'branch_product',
      entityId: 'bp-1',
      branchId: 'br-guntur',
      message: 'Branch product updated for Chicken Biryani',
      createdAt: '2026-09-24T10:05:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.branchOrdersApi.list.mockResolvedValue([orderSummary()]);
  MOCK_APIS.branchOrdersApi.get.mockResolvedValue(orderDetail());
  MOCK_APIS.branchOrdersApi.collectCod.mockResolvedValue(undefined);
  MOCK_APIS.branchProductsApi.list.mockResolvedValue([branchProduct()]);
  MOCK_APIS.branchSettingsApi.get.mockResolvedValue(BRANCH);
  MOCK_APIS.branchAuditApi.list.mockResolvedValue(AUDIT_RESULT);
});

describe('manager orders', () => {
  it('lists branch orders with totals and status', async () => {
    render(
      <MemoryRouter>
        <ManagerOrdersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('HB-20260924-000001')).toBeInTheDocument();
    expect(screen.getByText('₹430')).toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();
  });

  it('filters orders by status from the query string', async () => {
    render(
      <MemoryRouter initialEntries={['/manager/orders?status=PREPARING']}>
        <ManagerOrdersPage />
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260924-000001');
    await waitFor(() =>
      expect(MOCK_APIS.branchOrdersApi.list).toHaveBeenCalledWith('test-token', 'PREPARING'),
    );
  });

  it('advances a placed order to the next state from the detail page', async () => {
    MOCK_APIS.branchOrdersApi.advanceStatus.mockResolvedValue(orderDetail({ status: 'CONFIRMED' }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/manager/orders/ord-1']}>
        <Routes>
          <Route path="/manager/orders/:orderId" element={<ManagerOrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260924-000001');
    await user.click(screen.getByRole('button', { name: 'Confirm order' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchOrdersApi.advanceStatus).toHaveBeenCalledWith(
        'ord-1',
        'CONFIRMED',
        'test-token',
      ),
    );
  });

  it('cancels an order after confirmation', async () => {
    MOCK_APIS.branchOrdersApi.cancel.mockResolvedValue(orderDetail({ status: 'CANCELLED' }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/manager/orders/ord-1']}>
        <Routes>
          <Route path="/manager/orders/:orderId" element={<ManagerOrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260924-000001');
    await user.click(screen.getByRole('button', { name: 'Cancel order' }));

    const dialog = await screen.findByRole('dialog', { name: 'Cancel this order?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchOrdersApi.cancel).toHaveBeenCalledWith(
        'ord-1',
        undefined,
        'test-token',
      ),
    );
  });

  it('records a pending cash-on-delivery collection with a reason', async () => {
    const codOrder: OrderDetailDto = {
      ...orderDetail(),
      paymentStatus: 'PENDING',
      paymentMethod: 'COD',
      payments: [
        {
          id: 'pay-cod',
          provider: 'cod',
          providerPaymentId: 'cod_1',
          providerOrderId: null,
          method: 'COD',
          status: 'PENDING',
          amountMinor: 43000,
          currency: 'INR',
          collectedAt: null,
          collectedByRole: null,
          collectedById: null,
        },
      ],
      events: [
        {
          id: 'ev-cod',
          kind: 'COD_ORDER_CREATED',
          fromStatus: null,
          toStatus: 'PLACED',
          actorRole: 'CUSTOMER' as const,
          at: '2026-09-24T10:00:00.000Z',
        },
      ],
    };
    MOCK_APIS.branchOrdersApi.get.mockResolvedValue(codOrder);
    MOCK_APIS.branchOrdersApi.collectCod.mockResolvedValue({
      ...codOrder,
      paymentStatus: 'PAID',
      paymentMethod: 'COD',
      payments: [
        {
          ...codOrder.payments[0],
          status: 'PAID',
          collectedAt: '2026-09-24T11:00:00.000Z',
          collectedByRole: 'BRANCH_MANAGER',
          collectedById: 'mgr-1',
        },
      ],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/manager/orders/ord-1']}>
        <Routes>
          <Route path="/manager/orders/:orderId" element={<ManagerOrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260924-000001');
    expect(await screen.findByText(/Cash on delivery/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cash collected — record it' }));

    const dialog = await screen.findByRole('dialog', { name: 'Record cash collection' });
    await user.type(
      within(dialog).getByPlaceholderText(/Reason \(required\)/),
      'Cash received in hand',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Mark as collected' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchOrdersApi.collectCod).toHaveBeenCalledWith(
        'ord-1',
        'Cash received in hand',
        'test-token',
      ),
    );
    expect(await screen.findByText(/Collected .*· by branch/)).toBeInTheDocument();
  });
});

describe('manager catalogue', () => {
  it('lists branch products with effective prices', async () => {
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Chicken Biryani')).toBeInTheDocument();
    expect(screen.getByText('₹279')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('saves price and discount edits', async () => {
    MOCK_APIS.branchProductsApi.update.mockResolvedValue(
      branchProduct({ priceMinor: 34900, discountMinor: 0, effectivePriceMinor: 34900 }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');
    const priceInput = within(dialog).getByLabelText('Price (₹)');
    await user.clear(priceInput);
    await user.type(priceInput, '349');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchProductsApi.update).toHaveBeenCalledWith(
        'bp-1',
        expect.objectContaining({ priceMinor: 34900 }),
        'test-token',
      ),
    );
  });

  it('deactivates a product after confirmation', async () => {
    MOCK_APIS.branchProductsApi.deactivate.mockResolvedValue(
      branchProduct({ status: 'INACTIVE', isAvailable: false }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Hide' }));

    const dialog = await screen.findByRole('dialog', { name: 'Hide this product?' });
    await user.click(within(dialog).getByRole('button', { name: 'Hide product' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchProductsApi.deactivate).toHaveBeenCalledWith('bp-1', 'test-token'),
    );
  });

  it('never exposes global media controls to a branch manager', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('dialog');

    expect(screen.queryByLabelText('Choose product image')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Choose category image')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload image' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make primary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move up|Move down/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove image' })).not.toBeInTheDocument();
  });
});

describe('manager settings', () => {
  it('loads and saves the delivery radius', async () => {
    MOCK_APIS.branchSettingsApi.update.mockResolvedValue({
      ...BRANCH,
      deliveryRadiusKm: 12,
      address: 'New address',
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(MOCK_APIS.branchSettingsApi.get).toHaveBeenCalled());
    await screen.findByDisplayValue('MG Road, Guntur');
    const radius = screen.getByLabelText('Delivery radius (km)');
    await user.clear(radius);
    await user.type(radius, '12');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchSettingsApi.update).toHaveBeenCalledWith(
        expect.objectContaining({ deliveryRadiusKm: 12 }),
        'test-token',
        'br-guntur',
      ),
    );
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
  });
});

describe('manager audit log', () => {
  it('lists branch-scoped events', async () => {
    render(
      <MemoryRouter>
        <ManagerAuditPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('Branch product updated for Chicken Biryani'),
    ).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 1 events')).toBeInTheDocument();
    await waitFor(() =>
      expect(MOCK_APIS.branchAuditApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 25 }),
        'test-token',
      ),
    );
  });

  it('exports the CSV for the current query', async () => {
    MOCK_APIS.branchAuditApi.exportCsv.mockResolvedValue('id,createdAt\nevt-1,2026-09-24');
    const createObjectURL = vi.fn().mockReturnValue('blob:audit');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerAuditPage />
      </MemoryRouter>,
    );

    await screen.findByText('Branch product updated for Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchAuditApi.exportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
        'test-token',
      ),
    );
    vi.unstubAllGlobals();
  });
});

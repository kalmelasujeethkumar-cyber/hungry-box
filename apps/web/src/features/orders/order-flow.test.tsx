import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AddressDto,
  CartSummary,
  CheckoutPreviewDto,
  OrderDetailDto,
  OrderEventDto,
  OrderSummaryDto,
  PaymentIntentDto,
  ServiceabilityResult,
  VerifyPaymentResultDto,
} from '@hungrybox/shared';
import CartContents from '../../features/storefront/components/CartContents';
import CheckoutPage from '../../pages/customer/CheckoutPage';
import OrderDetailPage from '../../pages/customer/OrderDetailPage';
import OrderHistoryPage from '../../pages/customer/OrderHistoryPage';
import OrderSuccessPage from '../../pages/customer/OrderSuccessPage';

const MOCK_AUTH = vi.hoisted(() => ({
  user: {
    id: 'cust-1',
    loginId: 'customer@gmail.com',
    email: 'customer@gmail.com',
    name: 'Demo Customer',
    role: 'CUSTOMER' as const,
    status: 'ACTIVE',
    branchId: null,
  },
  token: 'test-token',
  initializing: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

const MOCK_HOOKS = vi.hoisted(() => ({
  storefront: { branch: null as ServiceabilityResult['branch'] },
  cart: { hasItems: true, loading: false, clearCart: vi.fn<() => Promise<void>>() },
}));

const MOCK_APIS = vi.hoisted(() => ({
  apiRequest: vi.fn(),
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
  authApi: { login: vi.fn(), me: vi.fn() },
  catalogApi: { listProducts: vi.fn(), listCategories: vi.fn(), getProduct: vi.fn() },
  locationsApi: { serviceability: vi.fn() },
  addressApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setDefault: vi.fn(),
    delete: vi.fn(),
  },
  cartApi: {
    get: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  checkoutApi: { preview: vi.fn(), paymentIntent: vi.fn() },
  paymentsApi: { verify: vi.fn(), devSimulate: vi.fn() },
  ordersApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), createCod: vi.fn(), cancel: vi.fn() },
  deliveryTrackingApi: { get: vi.fn() },
}));

vi.mock('../../api/client', () => MOCK_APIS);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));
vi.mock('../../features/storefront/cart-context', () => ({
  useCart: () => MOCK_HOOKS.cart,
}));
vi.mock('../../features/storefront/storefront-context', () => ({
  useStorefront: () => MOCK_HOOKS.storefront,
}));

const BRANCH: ServiceabilityResult['branch'] = {
  id: 'br-guntur',
  name: 'Guntur',
  code: 'GNT',
  city: 'Guntur',
  deliveryRadiusKm: 10,
};

const ADDRESS_A: AddressDto = {
  id: 'addr-a',
  label: 'HOME',
  recipientName: 'Demo Customer',
  phone: null,
  houseFlat: '2-13',
  streetArea: 'Lakshmipuram Main Road',
  landmark: null,
  city: 'Guntur',
  state: 'Andhra Pradesh',
  postalCode: '522007',
  latitude: 16.3015,
  longitude: 80.4405,
  deliveryInstructions: null,
  isDefault: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const PREVIEW_OK: CheckoutPreviewDto = {
  branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
  address: {
    id: 'addr-a',
    label: 'HOME',
    recipientName: 'Demo Customer',
    phone: null,
    houseFlat: '2-13',
    streetArea: 'Lakshmipuram Main Road',
    landmark: null,
    city: 'Guntur',
    state: 'Andhra Pradesh',
    postalCode: '522007',
    latitude: 16.3015,
    longitude: 80.4405,
    deliveryInstructions: null,
  },
  status: 'ok',
  issues: [],
  serviceable: true,
  distanceKm: 2.4,
  items: [
    {
      branchProductId: 'bp-biryani',
      productId: 'prod-biryani',
      productName: 'Hyderabadi Biryani',
      categoryName: 'Biryani',
      imageUrl: null,
      quantity: 2,
      unitPriceMinor: 24900,
      unitDiscountMinor: 4900,
      unitEffectivePriceMinor: 20000,
      lineSubtotalMinor: 49800,
      lineDiscountMinor: 9800,
      lineTotalMinor: 40000,
    },
  ],
  unavailableItems: [],
  priceChanges: [],
  subtotalMinor: 49800,
  discountMinor: 9800,
  deliveryFeeMinor: 3000,
  taxMinor: 0,
  totalMinor: 43000,
  itemCount: 2,
  needsConfirmation: false,
  availablePaymentMethods: ['UPI', 'CARD'],
};

const PREVIEW_COD: CheckoutPreviewDto = {
  ...PREVIEW_OK,
  availablePaymentMethods: ['UPI', 'CARD', 'COD'],
};

const INTENT: PaymentIntentDto = {
  paymentId: 'pay-1',
  provider: 'dev',
  providerPaymentId: 'dev-intent-1',
  amountMinor: 43000,
  currency: 'INR',
  method: 'UPI',
  status: 'PENDING',
};

const VERIFY_OK: VerifyPaymentResultDto = {
  paymentId: 'pay-1',
  providerPaymentId: 'dev-intent-1',
  verified: true,
  status: 'PAID',
  failureReason: null,
};

const ORDER_BASE: Omit<OrderDetailDto, 'status' | 'events' | 'cancelledAt'> = {
  id: 'ord-1',
  orderNumber: 'HB-20260923-000001',
  paymentStatus: 'PAID',
  paymentMethod: 'UPI',
  branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
  itemCount: 2,
  subtotalMinor: 49800,
  discountMinor: 9800,
  deliveryFeeMinor: 3000,
  taxMinor: 0,
  totalMinor: 43000,
  placedAt: '2026-09-23T10:00:00.000Z',
  items: [
    {
      id: 'oi-1',
      productId: 'prod-biryani',
      productName: 'Hyderabadi Biryani',
      quantity: 2,
      unitPriceMinor: 24900,
      unitDiscountMinor: 4900,
      unitEffectivePriceMinor: 20000,
      lineSubtotalMinor: 49800,
      lineDiscountMinor: 9800,
      lineTotalMinor: 40000,
    },
  ],
  address: {
    id: 'oa-1',
    label: 'HOME',
    recipientName: 'Demo Customer',
    phone: null,
    houseFlat: '2-13',
    streetArea: 'Lakshmipuram Main Road',
    landmark: null,
    city: 'Guntur',
    state: 'Andhra Pradesh',
    postalCode: '522007',
    latitude: 16.3015,
    longitude: 80.4405,
    deliveryInstructions: null,
  },
  payments: [
    {
      id: 'p-1',
      provider: 'dev',
      providerPaymentId: 'dev-intent-1',
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
};

const CREATED_EVENT: OrderEventDto = {
  id: 'e-1',
  kind: 'ORDER_CREATED',
  fromStatus: null,
  toStatus: 'PLACED',
  actorRole: 'SYSTEM',
  at: '2026-09-23T10:00:00.000Z',
};

const ORDER_PREPARING: OrderDetailDto = {
  ...ORDER_BASE,
  status: 'PREPARING',
  cancelledAt: null,
  events: [
    CREATED_EVENT,
    {
      ...CREATED_EVENT,
      id: 'e-2',
      kind: 'ORDER_STATUS_CHANGED',
      fromStatus: 'PLACED',
      toStatus: 'CONFIRMED',
      actorRole: 'BRANCH_MANAGER',
      at: '2026-09-23T10:05:00.000Z',
    },
    {
      ...CREATED_EVENT,
      id: 'e-3',
      fromStatus: 'CONFIRMED',
      toStatus: 'PREPARING',
      at: '2026-09-23T10:07:00.000Z',
    },
  ],
};

const ORDER_DELIVERED: OrderDetailDto = {
  ...ORDER_BASE,
  status: 'DELIVERED',
  cancelledAt: null,
  events: [CREATED_EVENT],
};

const COD_ORDER_PENDING: OrderDetailDto = {
  ...ORDER_BASE,
  status: 'PLACED',
  cancelledAt: null,
  events: [CREATED_EVENT],
  paymentStatus: 'PENDING',
  paymentMethod: 'COD',
  payments: [
    {
      id: 'p-cod',
      provider: 'cod',
      providerPaymentId: 'cod_4',
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
};

const CART_WITH_ITEMS: CartSummary = {
  id: 'cart-1',
  branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
  items: [
    {
      id: 'ci-1',
      branchProductId: 'bp-biryani',
      productId: 'prod-biryani',
      productName: 'Hyderabadi Biryani',
      productSlug: 'hyderabadi-biryani',
      categoryName: 'Biryani',
      imageUrl: null,
      unitPriceMinor: 24900,
      unitDiscountMinor: 4900,
      unitEffectivePriceMinor: 20000,
      quantity: 2,
      lineSubtotalMinor: 49800,
      lineDiscountMinor: 9800,
      lineTotalMinor: 40000,
    },
  ],
  subtotalMinor: 49800,
  discountMinor: 9800,
  totalMinor: 40000,
  itemCount: 2,
};

function renderCheckout(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/customer/checkout']}>
      <Routes>
        <Route path="/customer/checkout" element={<CheckoutPage />} />
        <Route
          path="/customer/checkout/success/:orderId"
          element={<p>Order placed, view it in your orders</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_HOOKS.storefront.branch = BRANCH;
  MOCK_HOOKS.cart.hasItems = true;
  MOCK_HOOKS.cart.loading = false;
  MOCK_HOOKS.cart.clearCart.mockResolvedValue(undefined);
  MOCK_APIS.addressApi.list.mockResolvedValue([ADDRESS_A]);
  MOCK_APIS.checkoutApi.preview.mockResolvedValue(PREVIEW_OK);
  MOCK_APIS.checkoutApi.paymentIntent.mockResolvedValue(INTENT);
  MOCK_APIS.paymentsApi.devSimulate.mockResolvedValue(undefined);
  MOCK_APIS.paymentsApi.verify.mockResolvedValue(VERIFY_OK);
  MOCK_APIS.ordersApi.create.mockResolvedValue(ORDER_PREPARING);
  MOCK_APIS.ordersApi.createCod.mockResolvedValue(ORDER_PREPARING);
  MOCK_APIS.deliveryTrackingApi.get.mockResolvedValue({
    orderId: 'ord-1',
    orderNumber: 'HB-20260923-000001',
    orderStatus: 'PREPARING',
    assignment: null,
    partner: null,
    location: null,
    distanceToDestinationKm: null,
    trackingAvailable: false,
  });
});

describe('checkout flow', () => {
  it('charges the server-confirmed total and places the order after a simulated payment', async () => {
    const user = userEvent.setup();
    renderCheckout();

    expect(await screen.findByText('Checkout')).toBeInTheDocument();
    await screen.findByLabelText(/2-13, Lakshmipuram Main Road/);

    const payButton = await screen.findByRole('button', { name: 'Pay ₹430' });
    await waitFor(() => expect(payButton).toBeEnabled());
    expect(screen.getByRole('radio', { name: /UPI/ })).toBeChecked();

    await user.click(payButton);
    expect(await screen.findByText('Online payment test')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve test payment' }));

    await waitFor(() => {
      expect(MOCK_APIS.ordersApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay-1',
          idempotencyKey: expect.any(String),
          addressId: 'addr-a',
        }),
        'test-token',
      );
    });
    expect(MOCK_APIS.paymentsApi.devSimulate).toHaveBeenCalledWith(
      { providerPaymentId: 'dev-intent-1', outcome: 'success' },
      'test-token',
    );
    expect(MOCK_APIS.paymentsApi.verify).toHaveBeenCalledWith({ paymentId: 'pay-1' }, 'test-token');
    expect(MOCK_HOOKS.cart.clearCart).toHaveBeenCalled();
    expect(await screen.findByText('Order placed, view it in your orders')).toBeInTheDocument();
  });

  it('surfaces a failed simulated payment without placing an order', async () => {
    const user = userEvent.setup();
    MOCK_APIS.paymentsApi.verify.mockResolvedValue({
      ...VERIFY_OK,
      verified: false,
      status: 'FAILED',
      failureReason: 'Insufficient funds',
    });
    renderCheckout();

    const payButton = await screen.findByRole('button', { name: 'Pay ₹430' });
    await user.click(payButton);

    await user.click(await screen.findByRole('button', { name: 'Approve test payment' }));

    expect(await screen.findByText('Insufficient funds')).toBeInTheDocument();
    expect(MOCK_APIS.ordersApi.create).not.toHaveBeenCalled();
  });

  it('cannot place the same order twice on a double payment approval', async () => {
    const user = userEvent.setup();
    renderCheckout();

    const payButton = await screen.findByRole('button', { name: 'Pay ₹430' });
    await waitFor(() => expect(payButton).toBeEnabled());
    await user.click(payButton);

    const approve = await screen.findByRole('button', { name: 'Approve test payment' });
    await user.dblClick(approve);

    await waitFor(() => expect(MOCK_APIS.ordersApi.create).toHaveBeenCalledTimes(1));
    expect(MOCK_APIS.paymentsApi.devSimulate).toHaveBeenCalledTimes(1);
  });

  it('places a cash-on-delivery order straight through without a gateway payment', async () => {
    const user = userEvent.setup();
    MOCK_APIS.checkoutApi.preview.mockResolvedValue(PREVIEW_COD);
    renderCheckout();

    const payButton = await screen.findByRole('button', { name: 'Pay ₹430' });
    await waitFor(() => expect(payButton).toBeEnabled());
    await user.click(screen.getByLabelText('Cash on delivery'));

    const placeButton = screen.getByRole('button', {
      name: 'Place order · Pay ₹430 on delivery',
    });
    await user.click(placeButton);

    await waitFor(() =>
      expect(MOCK_APIS.ordersApi.createCod).toHaveBeenCalledWith(
        expect.objectContaining({ addressId: 'addr-a', idempotencyKey: expect.any(String) }),
        'test-token',
      ),
    );
    expect(MOCK_APIS.checkoutApi.paymentIntent).not.toHaveBeenCalled();
    expect(MOCK_APIS.ordersApi.create).not.toHaveBeenCalled();
    expect(MOCK_HOOKS.cart.clearCart).toHaveBeenCalled();
    expect(await screen.findByText('Order placed, view it in your orders')).toBeInTheDocument();
  });

  it('routes a COD order through the confirm dialog when prices changed', async () => {
    const user = userEvent.setup();
    MOCK_APIS.checkoutApi.preview.mockResolvedValue({ ...PREVIEW_COD, needsConfirmation: true });
    renderCheckout();

    await user.click(await screen.findByLabelText('Cash on delivery'));
    const placeButton = screen.getByRole('button', {
      name: 'Place order · Pay ₹430 on delivery',
    });
    await user.click(placeButton);

    expect(await screen.findByRole('heading', { name: 'Prices changed' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() =>
      expect(MOCK_APIS.ordersApi.createCod).toHaveBeenCalledWith(
        expect.objectContaining({ addressId: 'addr-a' }),
        'test-token',
      ),
    );
    expect(MOCK_APIS.checkoutApi.paymentIntent).not.toHaveBeenCalled();
  });

  it('asks for a paid-updated-total confirmation when prices changed since the cart', async () => {
    const user = userEvent.setup();
    MOCK_APIS.checkoutApi.preview.mockResolvedValue({ ...PREVIEW_OK, needsConfirmation: true });
    renderCheckout();

    const payButton = await screen.findByRole('button', { name: 'Pay ₹430' });
    await waitFor(() => expect(payButton).toBeEnabled());
    await user.click(payButton);

    expect(await screen.findByRole('heading', { name: 'Prices changed' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pay updated total' }));

    await waitFor(() =>
      expect(MOCK_APIS.checkoutApi.paymentIntent).toHaveBeenCalledWith(
        { addressId: 'addr-a', method: 'UPI' },
        'test-token',
      ),
    );
  });

  it('blocks checkout when the server reports unavailable items', async () => {
    MOCK_APIS.checkoutApi.preview.mockResolvedValue({
      ...PREVIEW_OK,
      status: 'unavailable' as const,
      issues: ['Hyderabadi Biryani is no longer available'],
      totalMinor: 0,
      subtotalMinor: 0,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      availablePaymentMethods: [],
    });
    renderCheckout();

    expect(await screen.findByText('A few things to fix before ordering')).toBeInTheDocument();
    expect(screen.getByText('Hyderabadi Biryani is no longer available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ₹0' })).toBeDisabled();
  });

  it('shows a server-conflict preview returned with a 409', async () => {
    const user = userEvent.setup();
    MOCK_APIS.checkoutApi.paymentIntent.mockRejectedValue(
      new MOCK_APIS.ApiError('Prices changed', 409, {
        code: 'checkout.prices_changed',
        preview: { ...PREVIEW_OK, needsConfirmation: true },
      }),
    );
    renderCheckout();

    const payButton = await screen.findByRole('button', { name: 'Pay ₹430' });
    await user.click(payButton);

    expect(await screen.findByText(/Prices changed/)).toBeInTheDocument();

    await user.click(payButton);
    await user.click(await screen.findByRole('button', { name: 'Pay updated total' }));

    await waitFor(() =>
      expect(MOCK_APIS.checkoutApi.paymentIntent).toHaveBeenLastCalledWith(
        { addressId: 'addr-a', method: 'UPI' },
        'test-token',
      ),
    );
  });
});

describe('order history', () => {
  const summaries: OrderSummaryDto[] = [
    {
      id: 'ord-1',
      orderNumber: 'HB-20260923-000001',
      status: 'PLACED',
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
      itemCount: 2,
      subtotalMinor: 49800,
      discountMinor: 9800,
      deliveryFeeMinor: 3000,
      taxMinor: 0,
      totalMinor: 43000,
      placedAt: '2026-09-23T10:00:00.000Z',
      cancelledAt: null,
    },
    {
      id: 'ord-2',
      orderNumber: 'HB-20260922-000003',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
      itemCount: 1,
      subtotalMinor: 8000,
      discountMinor: 0,
      deliveryFeeMinor: 3000,
      taxMinor: 0,
      totalMinor: 11000,
      placedAt: '2026-09-22T09:00:00.000Z',
      cancelledAt: null,
    },
    {
      id: 'ord-3',
      orderNumber: 'HB-20260921-000002',
      status: 'CANCELLED',
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
      itemCount: 1,
      subtotalMinor: 8000,
      discountMinor: 0,
      deliveryFeeMinor: 3000,
      taxMinor: 0,
      totalMinor: 11000,
      placedAt: '2026-09-21T08:00:00.000Z',
      cancelledAt: '2026-09-21T08:30:00.000Z',
    },
  ];

  it('renders every order with its status and totals', async () => {
    MOCK_APIS.ordersApi.list.mockResolvedValue(summaries);
    render(
      <MemoryRouter>
        <OrderHistoryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('HB-20260923-000001')).toBeInTheDocument();
    expect(screen.getByText('HB-20260922-000003')).toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('₹430')).toBeInTheDocument();
    expect(MOCK_APIS.ordersApi.list).toHaveBeenCalledWith('test-token');
  });

  it('filters orders by status tabs', async () => {
    const user = userEvent.setup();
    MOCK_APIS.ordersApi.list.mockResolvedValue(summaries);
    render(
      <MemoryRouter>
        <OrderHistoryPage />
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260923-000001');
    await user.click(screen.getByRole('tab', { name: 'Delivered (1)' }));

    expect(screen.getByText('HB-20260922-000003')).toBeInTheDocument();
    expect(screen.queryByText('HB-20260923-000001')).not.toBeInTheDocument();
    expect(screen.queryByText('HB-20260921-000002')).not.toBeInTheDocument();
  });

  it('shows an empty state before the first order', async () => {
    MOCK_APIS.ordersApi.list.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <OrderHistoryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });
});

describe('order detail', () => {
  it('shows the timeline, item snapshots, address and payment', async () => {
    MOCK_APIS.ordersApi.get.mockResolvedValue(ORDER_PREPARING);
    render(
      <MemoryRouter initialEntries={['/customer/orders/ord-1']}>
        <Routes>
          <Route path="/customer/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('HB-20260923-000001')).toBeInTheDocument();
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getByText('Preparing · current')).toBeInTheDocument();
    expect(screen.getByText(/2-13, Lakshmipuram Main Road/)).toBeInTheDocument();
    expect(screen.getByText(/Guntur · Andhra Pradesh · 522007/)).toBeInTheDocument();
    expect(screen.getByText('UPI')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(MOCK_APIS.ordersApi.get).toHaveBeenCalledWith('ord-1', 'test-token');
  });

  it('marks where cash was collected for a closed COD payment', async () => {
    MOCK_APIS.ordersApi.get.mockResolvedValue({
      ...COD_ORDER_PENDING,
      paymentStatus: 'PAID',
      events: [CREATED_EVENT],
      payments: [
        {
          ...COD_ORDER_PENDING.payments[0],
          status: 'PAID',
          collectedAt: '2026-09-24T09:00:00.000Z',
          collectedByRole: 'DELIVERY_PARTNER',
          collectedById: 'dp-1',
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/customer/orders/ord-1']}>
        <Routes>
          <Route path="/customer/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cash on delivery')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText(/· by partner$/)).toBeInTheDocument();
  });

  it('hides the cancel action once the order is out of the cancellable window', async () => {
    MOCK_APIS.ordersApi.get.mockResolvedValue(ORDER_DELIVERED);
    render(
      <MemoryRouter initialEntries={['/customer/orders/ord-1']}>
        <Routes>
          <Route path="/customer/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260923-000001');
    expect(screen.queryByRole('button', { name: 'Cancel this order' })).not.toBeInTheDocument();
  });

  it('cancels an order with an optional reason', async () => {
    const user = userEvent.setup();
    MOCK_APIS.ordersApi.get.mockResolvedValue({
      ...ORDER_PREPARING,
      status: 'PLACED',
      events: [CREATED_EVENT],
    });
    const cancelled: OrderDetailDto = {
      ...ORDER_PREPARING,
      status: 'CANCELLED',
      cancelledAt: '2026-09-23T10:20:00.000Z',
      events: [
        CREATED_EVENT,
        {
          ...CREATED_EVENT,
          id: 'e-9',
          kind: 'ORDER_CANCELLED',
          fromStatus: 'PLACED',
          toStatus: null,
          actorRole: 'CUSTOMER',
          at: '2026-09-23T10:20:00.000Z',
        },
      ],
    };
    MOCK_APIS.ordersApi.cancel.mockResolvedValue(cancelled);
    render(
      <MemoryRouter initialEntries={['/customer/orders/ord-1']}>
        <Routes>
          <Route path="/customer/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260923-000001');
    await user.click(screen.getByRole('button', { name: 'Cancel this order' }));

    const dialog = await screen.findByRole('dialog', { name: `Cancel HB-20260923-000001?` });
    await user.type(
      within(dialog).getByPlaceholderText('Reason (optional)'),
      'order placed by mistake',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Yes, cancel order' }));

    await waitFor(() =>
      expect(MOCK_APIS.ordersApi.cancel).toHaveBeenCalledWith(
        'ord-1',
        { reason: 'order placed by mistake' },
        'test-token',
      ),
    );
    const cancelledLabels = await screen.findAllByText('Cancelled');
    expect(cancelledLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Cancel this order' })).not.toBeInTheDocument();
  });
});

describe('cart checkout button', () => {
  it('enables checkout when a handler is wired up', async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn();
    render(
      <CartContents
        cart={CART_WITH_ITEMS}
        loading={false}
        onUpdateQuantity={vi.fn()}
        onRemove={vi.fn()}
        onCheckout={onCheckout}
      />,
    );

    const button = screen.getByRole('button', { name: 'Proceed to checkout' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('stays disabled without a checkout handler', () => {
    render(
      <CartContents
        cart={CART_WITH_ITEMS}
        loading={false}
        onUpdateQuantity={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Proceed to checkout' })).toBeDisabled();
  });
});

describe('order success page', () => {
  it('shows the cash amount to pay on delivery for a COD order', async () => {
    MOCK_APIS.ordersApi.get.mockResolvedValue(COD_ORDER_PENDING);
    render(
      <MemoryRouter initialEntries={['/customer/checkout/success/ord-1']}>
        <Routes>
          <Route path="/customer/checkout/success/:orderId" element={<OrderSuccessPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('To pay on delivery')).toBeInTheDocument();
    expect(screen.getByText('₹430 — in cash')).toBeInTheDocument();
  });

  it('keeps the paid label for an online-paid order', async () => {
    MOCK_APIS.ordersApi.get.mockResolvedValue(ORDER_PREPARING);
    render(
      <MemoryRouter initialEntries={['/customer/checkout/success/ord-1']}>
        <Routes>
          <Route path="/customer/checkout/success/:orderId" element={<OrderSuccessPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Payment')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuditListResultDto,
  BranchDto,
  BranchProductDto,
  BranchProductImageDto,
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
  branchProductMediaApi: {
    uploadImage: vi.fn(),
    setPrimaryImage: vi.fn(),
    reorderImages: vi.fn(),
    removeImage: vi.fn(),
  },
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

function jpegFile(name = 'branch.jpg'): File {
  return new File([new Uint8Array(64)], name, { type: 'image/jpeg' });
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
    imageUrl: null,
    branchImages: [],
    globalImages: [],
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
      <MemoryRouter initialEntries={['/admin/branch/orders?status=PREPARING']}>
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
      <MemoryRouter initialEntries={['/admin/branch/orders/ord-1']}>
        <Routes>
          <Route path="/admin/branch/orders/:orderId" element={<ManagerOrderDetailPage />} />
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
      <MemoryRouter initialEntries={['/admin/branch/orders/ord-1']}>
        <Routes>
          <Route path="/admin/branch/orders/:orderId" element={<ManagerOrderDetailPage />} />
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
      <MemoryRouter initialEntries={['/admin/branch/orders/ord-1']}>
        <Routes>
          <Route path="/admin/branch/orders/:orderId" element={<ManagerOrderDetailPage />} />
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

  it('blocks saving when the discount is higher than the price', async () => {
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
    const discountInput = within(dialog).getByLabelText('Discount (₹)');

    await user.clear(discountInput);
    await user.type(discountInput, '400');

    expect(await screen.findByText('Discount cannot exceed price.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(MOCK_APIS.branchProductsApi.update).not.toHaveBeenCalled();

    await user.clear(priceInput);
    await user.type(priceInput, '500');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchProductsApi.update).toHaveBeenCalledWith(
        'bp-1',
        expect.objectContaining({ priceMinor: 50000, discountMinor: 40000 }),
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

describe('manager branch images', () => {
  const BRANCH_IMAGE_URL =
    'https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/branches/br-guntur/products/bp-1/a.jpg';
  const GLOBAL_IMAGE_URL =
    'https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/products/p-1/g.jpg';

  function branchImage(overrides: Partial<BranchProductImageDto> = {}): BranchProductImageDto {
    return {
      id: 'bpi-1',
      imageUrl: BRANCH_IMAGE_URL,
      altText: 'Biryani in a bowl',
      sortOrder: 0,
      isPrimary: true,
      ...overrides,
    };
  }

  async function openBranchEdit(
    product: BranchProductDto,
  ): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    MOCK_APIS.branchProductsApi.list.mockResolvedValue([product]);
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );
    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('dialog');
    return user;
  }

  it('previews the chosen branch image before uploading it', async () => {
    const user = await openBranchEdit(branchProduct());
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByTestId('image-field-preview')).not.toBeInTheDocument();

    await user.upload(within(dialog).getByLabelText('Choose branch image'), jpegFile());

    expect(within(dialog).getByTestId('image-field-preview')).toBeInTheDocument();
    expect(MOCK_APIS.branchProductMediaApi.uploadImage).not.toHaveBeenCalled();
  });

  it('uploads a branch image with its description against the branch product id only', async () => {
    MOCK_APIS.branchProductMediaApi.uploadImage.mockResolvedValue(
      branchProduct({ branchImages: [branchImage()], imageUrl: BRANCH_IMAGE_URL }),
    );
    const user = await openBranchEdit(branchProduct());
    const dialog = screen.getByRole('dialog');

    await user.upload(within(dialog).getByLabelText('Choose branch image'), jpegFile());
    await user.type(
      within(dialog).getByLabelText('Description for this image (optional)'),
      'Fresh biryani',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Upload branch image' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchProductMediaApi.uploadImage).toHaveBeenCalledWith(
        'bp-1',
        expect.any(File),
        'Fresh biryani',
        'test-token',
      ),
    );
    expect(
      await within(dialog).findByText('1 of 3 branch images — JPEG, PNG or WebP, up to 5 MB'),
    ).toBeInTheDocument();
  });

  it('rejects a branch image that is not a JPEG, PNG or WebP file', async () => {
    const user = userEvent.setup({ applyAccept: false });
    MOCK_APIS.branchProductsApi.list.mockResolvedValue([branchProduct()]);
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );
    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');

    await user.upload(
      within(dialog).getByLabelText('Choose branch image'),
      new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Upload branch image' }));

    expect(
      await within(dialog).findByText('Choose a JPEG, PNG or WebP image.'),
    ).toBeInTheDocument();
    expect(MOCK_APIS.branchProductMediaApi.uploadImage).not.toHaveBeenCalled();
  });

  it('promotes a branch image to primary and shows it to customers', async () => {
    MOCK_APIS.branchProductMediaApi.setPrimaryImage.mockResolvedValue(
      branchProduct({
        branchImages: [
          branchImage({ id: 'bpi-2', isPrimary: true, sortOrder: 0 }),
          branchImage({ id: 'bpi-1', isPrimary: false, sortOrder: 1 }),
        ],
        imageUrl: BRANCH_IMAGE_URL,
      }),
    );
    const user = await openBranchEdit(
      branchProduct({
        branchImages: [
          branchImage({ id: 'bpi-1', isPrimary: true, sortOrder: 0 }),
          branchImage({ id: 'bpi-2', isPrimary: false, sortOrder: 1 }),
        ],
      }),
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getAllByText('Shown to customers')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Set as branch primary' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchProductMediaApi.setPrimaryImage).toHaveBeenCalledWith(
        'bpi-2',
        'test-token',
      ),
    );
  });

  it('reorders branch images by sending the full new order', async () => {
    MOCK_APIS.branchProductMediaApi.reorderImages.mockResolvedValue(
      branchProduct({
        branchImages: [
          branchImage({ id: 'bpi-2', isPrimary: true, sortOrder: 0 }),
          branchImage({ id: 'bpi-1', isPrimary: false, sortOrder: 1 }),
        ],
      }),
    );
    const user = await openBranchEdit(
      branchProduct({
        branchImages: [
          branchImage({ id: 'bpi-1', isPrimary: true, sortOrder: 0 }),
          branchImage({ id: 'bpi-2', isPrimary: false, sortOrder: 1 }),
        ],
      }),
    );
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getAllByRole('button', { name: 'Move image down' })[0]);

    await waitFor(() =>
      expect(MOCK_APIS.branchProductMediaApi.reorderImages).toHaveBeenCalledWith(
        { orderedImageIds: ['bpi-2', 'bpi-1'] },
        'test-token',
      ),
    );
  });

  it('removes a branch image only after confirmation', async () => {
    MOCK_APIS.branchProductMediaApi.removeImage.mockResolvedValue(
      branchProduct({ branchImages: [], imageUrl: GLOBAL_IMAGE_URL }),
    );
    const user = await openBranchEdit(branchProduct({ branchImages: [branchImage()] }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(MOCK_APIS.branchProductMediaApi.removeImage).not.toHaveBeenCalled();

    const confirm = await screen.findByRole('dialog', { name: 'Remove this branch image?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove branch image' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchProductMediaApi.removeImage).toHaveBeenCalledWith(
        'bpi-1',
        'test-token',
      ),
    );
    expect(
      await within(dialog).findByText('No branch images yet, so the Hungry Box image is used.'),
    ).toBeInTheDocument();
  });

  it('shows the branch image on the product card and the global image as read-only reference', async () => {
    MOCK_APIS.branchProductsApi.list.mockResolvedValue([
      branchProduct({
        imageUrl: BRANCH_IMAGE_URL,
        branchImages: [branchImage()],
        globalImages: [
          {
            id: 'img-1',
            imageUrl: GLOBAL_IMAGE_URL,
            altText: 'Biryani',
            sortOrder: 0,
            isPrimary: true,
          },
        ],
      }),
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('img', { name: 'Chicken Biryani' })).toHaveAttribute(
      'src',
      BRANCH_IMAGE_URL,
    );
    expect(screen.getByText('1 branch image')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');

    const hqSection = within(dialog).getByRole('region', { name: 'Images from Hungry Box HQ' });
    expect(within(hqSection).getByRole('img', { name: 'Biryani' })).toBeInTheDocument();
    expect(within(hqSection).queryByRole('button')).not.toBeInTheDocument();
  });

  it('falls back to the global Hungry Box image when a branch has no branch image', async () => {
    MOCK_APIS.branchProductsApi.list.mockResolvedValue([
      branchProduct({
        imageUrl: GLOBAL_IMAGE_URL,
        branchImages: [],
        globalImages: [
          {
            id: 'img-1',
            imageUrl: GLOBAL_IMAGE_URL,
            altText: 'Biryani',
            sortOrder: 0,
            isPrimary: true,
          },
        ],
      }),
    ]);
    render(
      <MemoryRouter>
        <ManagerCatalogPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('img', { name: 'Chicken Biryani' })).toHaveAttribute(
      'src',
      GLOBAL_IMAGE_URL,
    );
    expect(screen.getByText('Using the Hungry Box image')).toBeInTheDocument();
  });

  it('stops offering new branch images once the limit is reached', async () => {
    await openBranchEdit(
      branchProduct({
        branchImages: [
          branchImage({ id: 'bpi-1', sortOrder: 0 }),
          branchImage({ id: 'bpi-2', sortOrder: 1 }),
          branchImage({ id: 'bpi-3', sortOrder: 2 }),
        ],
      }),
    );
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Maximum of 3 branch images reached.')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Choose branch image')).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Upload branch image' }),
    ).not.toBeInTheDocument();
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

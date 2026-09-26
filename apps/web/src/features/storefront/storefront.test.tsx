import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { JSX } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AddressDto,
  CartSummary,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDetail,
  ServiceabilityResult,
} from '@hungrybox/shared';
import { CartProvider } from './cart-context';
import AppNav from './components/AppNav';
import CartSheet from './components/CartSheet';
import LocationModal from './components/LocationModal';
import StorefrontHeader from './components/StorefrontHeader';
import { StorefrontProvider } from './storefront-context';
import AddressesPage from '../../pages/customer/AddressesPage';
import StorefrontPage from '../../pages/customer/StorefrontPage';

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

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));

vi.mock('../../api/client', () => ({
  apiRequest: vi.fn(),
  ApiError: class extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
  authApi: {
    login: vi.fn(),
    me: vi.fn(),
  },
  catalogApi: {
    listProducts: vi.fn(),
    listCategories: vi.fn(),
    getProduct: vi.fn(),
  },
  locationsApi: {
    serviceability: vi.fn(),
  },
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
}));

import { addressApi, cartApi, catalogApi, locationsApi } from '../../api/client';

const catalogApiMock = vi.mocked(catalogApi);
const locationsApiMock = vi.mocked(locationsApi);
const addressApiMock = vi.mocked(addressApi);
const cartApiMock = vi.mocked(cartApi);

const GUNTUR_BRANCH: ServiceabilityResult = {
  serviceable: true,
  distanceKm: 2.4,
  branch: {
    id: 'br-guntur',
    name: 'Guntur',
    code: 'GNT',
    city: 'Guntur',
    deliveryRadiusKm: 10,
  },
};

const HYDERABAD_BRANCH: ServiceabilityResult = {
  serviceable: true,
  distanceKm: 30.5,
  branch: {
    id: 'br-hyderabad',
    name: 'Hyderabad',
    code: 'HYD',
    city: 'Hyderabad',
    deliveryRadiusKm: 15,
  },
};

const UNSERVICEABLE: ServiceabilityResult = {
  serviceable: false,
  distanceKm: 24.2,
  branch: null,
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

const ADDRESS_B: AddressDto = {
  id: 'addr-b',
  label: 'WORK',
  recipientName: 'Demo Customer',
  phone: null,
  houseFlat: '4-1',
  streetArea: 'MG Road',
  landmark: null,
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500003',
  latitude: 17.385,
  longitude: 78.4867,
  deliveryInstructions: null,
  isDefault: false,
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

const CATEGORY: CatalogCategory = {
  id: 'cat-biryani',
  name: 'Biryani',
  slug: 'biryani',
  description: null,
  imageUrl: null,
  sortOrder: 1,
};

const BIRYANI: CatalogProduct = {
  productId: 'prod-biryani',
  name: 'Hyderabadi Biryani',
  slug: 'hyderabadi-biryani',
  description: 'Slow-cooked basmati rice.',
  categoryName: 'Biryani',
  categorySlug: 'biryani',
  imageUrl: null,
  priceMinor: 24900,
  discountMinor: 4900,
  effectivePriceMinor: 20000,
  isAvailable: true,
};

const PANEER: CatalogProduct = {
  productId: 'prod-paneer',
  name: 'Paneer Roll',
  slug: 'paneer-roll',
  description: 'Grilled paneer wrap.',
  categoryName: 'Snacks',
  categorySlug: 'snacks',
  imageUrl: null,
  priceMinor: 8000,
  discountMinor: 0,
  effectivePriceMinor: 8000,
  isAvailable: true,
};

const DETAIL: CatalogProductDetail = {
  productId: 'prod-biryani',
  name: 'Hyderabadi Biryani',
  slug: 'hyderabadi-biryani',
  description: 'Slow-cooked basmati rice served with raita.',
  categoryId: 'cat-biryani',
  categoryName: 'Biryani',
  categorySlug: 'biryani',
  images: [],
  imageUrl: null,
  priceMinor: 24900,
  discountMinor: 4900,
  effectivePriceMinor: 20000,
  isAvailable: true,
};

const EMPTY_CART: CartSummary = {
  id: null,
  branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
  items: [],
  subtotalMinor: 0,
  discountMinor: 0,
  totalMinor: 0,
  itemCount: 0,
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

const CART_UPDATE_ITEM: CartSummary = {
  ...CART_WITH_ITEMS,
  items: [{ ...CART_WITH_ITEMS.items[0], quantity: 3, lineTotalMinor: 60000 }],
  totalMinor: 60000,
  itemCount: 3,
};

function harness(ui: JSX.Element): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/customer/storefront']}>
      <StorefrontProvider>
        <CartProvider>
          <StorefrontHeader />
          {ui}
          <AppNav />
          <CartSheet />
          <LocationModal />
        </CartProvider>
      </StorefrontProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  addressApiMock.list.mockResolvedValue([ADDRESS_A]);
  locationsApiMock.serviceability.mockResolvedValue(GUNTUR_BRANCH);
  catalogApiMock.listCategories.mockResolvedValue([CATEGORY]);
  catalogApiMock.listProducts.mockResolvedValue([BIRYANI, PANEER]);
  catalogApiMock.getProduct.mockResolvedValue(DETAIL);
  cartApiMock.get.mockResolvedValue(EMPTY_CART);
  cartApiMock.addItem.mockResolvedValue(CART_WITH_ITEMS);
  cartApiMock.updateItem.mockResolvedValue(CART_UPDATE_ITEM);
  cartApiMock.removeItem.mockResolvedValue(EMPTY_CART);
  cartApiMock.clear.mockResolvedValue(EMPTY_CART);
});

describe('storefront browsing', () => {
  it('renders the menu from the catalog for the serviceable branch', async () => {
    harness(<StorefrontPage />);

    expect(await screen.findByText('Hyderabadi Biryani')).toBeInTheDocument();
    expect(screen.getByText('Paneer Roll')).toBeInTheDocument();
    expect(screen.getByText('₹200')).toBeInTheDocument();
    expect(screen.queryByText('Out of delivery range')).not.toBeInTheDocument();
    expect(catalogApi.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br-guntur' }),
      'test-token',
    );
  });

  it('filters the menu by category chip', async () => {
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    const chip = await screen.findByRole('button', { name: 'Biryani' });
    await user.click(chip);

    await waitFor(() =>
      expect(catalogApi.listProducts).toHaveBeenCalledWith(
        expect.objectContaining({ categorySlug: 'biryani' }),
        'test-token',
      ),
    );
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches the menu from the search bar', async () => {
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    await screen.findByText('Hyderabadi Biryani');
    await user.type(screen.getByLabelText('Search the menu'), 'biryani');

    await waitFor(() =>
      expect(catalogApi.listProducts).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'biryani' }),
        'test-token',
      ),
    );
  });

  it('opens product details from a card', async () => {
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    await user.click(await screen.findByRole('button', { name: 'View Hyderabadi Biryani' }));

    const dialog = await screen.findByRole('dialog', { name: 'Hyderabadi Biryani' });
    expect(
      within(dialog).getByText(/slow-cooked basmati rice served with raita/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  });

  it('shows an empty state when the filtered menu has no items', async () => {
    catalogApiMock.listProducts.mockResolvedValue([]);
    harness(<StorefrontPage />);

    expect(await screen.findByText('No items yet')).toBeInTheDocument();
  });

  it('blocks browsing when the location is out of delivery range', async () => {
    locationsApiMock.serviceability.mockResolvedValue(UNSERVICEABLE);
    harness(<StorefrontPage />);

    expect(await screen.findByText('Out of delivery range')).toBeInTheDocument();
    expect(screen.queryByText('Hyderabadi Biryani')).not.toBeInTheDocument();
  });
});

describe('cart', () => {
  it('adds an item and shows it in the cart sheet with server totals', async () => {
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    await user.click(await screen.findByRole('button', { name: 'Add Hyderabadi Biryani to cart' }));

    expect(cartApi.addItem).toHaveBeenCalledWith('br-guntur', 'prod-biryani', 1, 'test-token');

    const sheet = await screen.findByRole('dialog', { name: 'Your cart' });
    expect(within(sheet).getByText('Hyderabadi Biryani')).toBeInTheDocument();
    expect(within(sheet).getAllByText('₹400').length).toBeGreaterThan(0);
  });

  it('adjusts quantity and reflects the new server total', async () => {
    cartApiMock.get.mockResolvedValue(CART_WITH_ITEMS);
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    await user.click(await screen.findByRole('button', { name: /Open cart/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Your cart' });

    await user.click(
      within(sheet).getByRole('button', { name: 'Increase Hyderabadi Biryani quantity' }),
    );

    expect(cartApi.updateItem).toHaveBeenCalledWith('ci-1', 3, 'test-token');
    await waitFor(() => expect(within(sheet).getAllByText('₹600').length).toBeGreaterThan(0));
  });

  it('shows an empty state when the cart has no items', async () => {
    cartApiMock.get.mockResolvedValue(EMPTY_CART);
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    await user.click(await screen.findByRole('button', { name: /Open cart/ }));

    expect(await screen.findByRole('dialog', { name: 'Your cart' })).toBeInTheDocument();
    expect(await screen.findByText(/your cart is empty/i)).toBeInTheDocument();
  });
});

describe('location switching', () => {
  it('asks for confirmation before switching branch with a non-empty cart', async () => {
    cartApiMock.get.mockResolvedValue(CART_WITH_ITEMS);
    const user = userEvent.setup();
    addressApiMock.list.mockResolvedValue([ADDRESS_A, ADDRESS_B]);
    harness(<StorefrontPage />);

    await screen.findByText('Hyderabadi Biryani');

    await user.click(screen.getByRole('button', { name: /Guntur/ }));

    locationsApiMock.serviceability.mockReset().mockResolvedValue(HYDERABAD_BRANCH);
    await user.click(await screen.findByRole('button', { name: /4-1/ }));

    expect(
      await screen.findByRole('heading', { name: 'Switch delivery branch?' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch branch' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Switch delivery branch?' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole('button', { name: 'Hyderabad · Hyderabad' }),
    ).toBeInTheDocument();
  });
});

describe('addresses', () => {
  it('lists saved addresses and creates a new one', async () => {
    const user = userEvent.setup();
    addressApiMock.list.mockResolvedValue([ADDRESS_A]);
    addressApiMock.create.mockResolvedValue(ADDRESS_B);
    harness(<AddressesPage />);

    expect(await screen.findByText(/2-13, Lakshmipuram Main Road/)).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add address' }));

    const form = await screen.findByRole('dialog', { name: 'Add address' });
    await user.type(within(form).getByLabelText(/Recipient name/), 'Demo Customer');
    await user.type(within(form).getByLabelText(/House \/ flat/), '4-1');
    await user.type(within(form).getByLabelText(/Street \/ area/), 'MG Road');
    await user.type(within(form).getByLabelText(/City/), 'Hyderabad');
    await user.type(within(form).getByLabelText(/State/), 'Telangana');
    await user.type(within(form).getByLabelText(/PIN \/ postal code/), '500003');
    await user.click(within(form).getByRole('button', { name: 'Save address' }));

    expect(addressApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'HOME',
        recipientName: 'Demo Customer',
        houseFlat: '4-1',
        city: 'Hyderabad',
        latitude: null,
        longitude: null,
      }),
      'test-token',
    );
  });

  it('validates required fields before creating', async () => {
    const user = userEvent.setup();
    harness(<AddressesPage />);

    await screen.findByText(/2-13, Lakshmipuram Main Road/);
    await user.click(screen.getByRole('button', { name: 'Add address' }));

    const form = await screen.findByRole('dialog', { name: 'Add address' });
    await user.click(within(form).getByRole('button', { name: 'Save address' }));

    expect(await within(form).findByText(/required fields/i)).toBeInTheDocument();
    expect(addressApiMock.create).not.toHaveBeenCalled();
  });
});

describe('mobile-first shell', () => {
  it('keeps large touch targets and a bottom navigation for customers', async () => {
    harness(<StorefrontPage />);

    const addButton = await screen.findByRole('button', { name: 'Add Hyderabadi Biryani to cart' });
    expect(addButton).toBeInTheDocument();
    expect(addButton).toHaveClass('py-2.5');

    for (const label of ['Home', 'Cart', 'Orders', 'Addresses', 'Profile']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});

describe('storefront production polish', () => {
  it('keeps working desktop navigation with a highlighted active link', async () => {
    harness(<StorefrontPage />);

    await screen.findByText('Hyderabadi Biryani');

    const navs = screen.getAllByRole('navigation', { name: 'Primary' });
    const desktopNav = navs[0];
    expect(desktopNav).toHaveClass('hidden');

    const home = within(desktopNav).getByRole('link', { name: 'Home' });
    const orders = within(desktopNav).getByRole('link', { name: 'Orders' });
    expect(home).toHaveAttribute('href', '/customer/storefront');
    expect(orders).toHaveAttribute('href', '/customer/orders');
    expect(home).toHaveClass('text-brand-navy');
    expect(orders).toHaveClass('text-slate-500');

    const cartButton = screen.getByRole('button', { name: /Open cart/ });
    expect(cartButton).toHaveAttribute('aria-label', 'Open cart');
  });

  it('shows a search-aware empty state and clears the search in one tap', async () => {
    catalogApiMock.listProducts.mockResolvedValue([]);
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    expect(await screen.findByText('No items yet')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search the menu'), 'zzz');

    expect(await screen.findByText('No results found')).toBeInTheDocument();
    expect(screen.getByText(/could not find anything matching “zzz”/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(await screen.findByText('No items yet')).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('Search the menu').value).toBe('');
  });

  it('prints a discount badge and strikethrough price on a discounted card', async () => {
    harness(<StorefrontPage />);

    const card = (await screen.findByRole('button', { name: 'View Hyderabadi Biryani' })).closest(
      'article',
    );
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('20% off')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('₹249')).toHaveClass('line-through');
  });
});

describe('storefront catalogue media', () => {
  it('renders the optimized primary image and falls back to an initial otherwise', async () => {
    const BIRYANI_IMAGE =
      'https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/products/prod-biryani/hash.jpg';
    const CATEGORY_IMAGE =
      'https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/categories/cat-biryani/hash.jpg';
    catalogApiMock.listCategories.mockResolvedValue([{ ...CATEGORY, imageUrl: CATEGORY_IMAGE }]);
    catalogApiMock.listProducts.mockResolvedValue([
      { ...BIRYANI, imageUrl: BIRYANI_IMAGE },
      PANEER,
    ]);
    catalogApiMock.getProduct.mockResolvedValue({ ...DETAIL, imageUrl: BIRYANI_IMAGE });
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    const cardImage = await screen.findByRole('img', { name: 'Hyderabadi Biryani' });
    expect(cardImage).toHaveAttribute('src', BIRYANI_IMAGE);

    const paneerCard = (await screen.findByRole('button', { name: 'View Paneer Roll' })).closest(
      'article',
    );
    expect(paneerCard).not.toBeNull();
    expect(within(paneerCard as HTMLElement).getByText('P')).toBeInTheDocument();

    const nav = await screen.findByRole('navigation', { name: 'Menu categories' });
    const categoryThumb = nav.querySelector('img');
    expect(categoryThumb).not.toBeNull();
    expect(categoryThumb as HTMLImageElement).toHaveAttribute('src', CATEGORY_IMAGE);

    await user.click(screen.getByRole('button', { name: 'View Hyderabadi Biryani' }));
    const dialog = await screen.findByRole('dialog', { name: 'Hyderabadi Biryani' });
    expect(within(dialog).getByRole('img', { name: 'Hyderabadi Biryani' })).toHaveAttribute(
      'src',
      BIRYANI_IMAGE,
    );
  });

  it('shows the cart item image when a product has one', async () => {
    const CART_IMAGE =
      'https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/products/prod-biryani/hash.jpg';
    cartApiMock.get.mockResolvedValue({
      ...CART_WITH_ITEMS,
      items: [{ ...CART_WITH_ITEMS.items[0], imageUrl: CART_IMAGE }],
    });
    const user = userEvent.setup();
    harness(<StorefrontPage />);

    await user.click(await screen.findByRole('button', { name: /Open cart/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Your cart' });
    expect(within(sheet).getByRole('img', { name: 'Hyderabadi Biryani' })).toHaveAttribute(
      'src',
      CART_IMAGE,
    );
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CategoryDto,
  GlobalProductDetailDto,
  GlobalProductListItemDto,
  ProductImageDto,
} from '@hungrybox/shared';
import AdminCataloguePage from './AdminCataloguePage';

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
  productsApi: {
    listAdmin: vi.fn(),
    getAdmin: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    uploadImage: vi.fn(),
    setPrimaryImage: vi.fn(),
    reorderImages: vi.fn(),
    removeImage: vi.fn(),
  },
  categoriesApi: {
    listAdmin: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    uploadImage: vi.fn(),
    removeImage: vi.fn(),
  },
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

function productItem(): GlobalProductListItemDto {
  return {
    id: 'p-1',
    name: 'Chicken Biryani',
    slug: 'chicken-biryani',
    description: null,
    categoryId: 'c-1',
    categoryName: 'Biryani',
    status: 'ACTIVE',
    imageUrl: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
  };
}

function productDetail(images: ProductImageDto[] = []): GlobalProductDetailDto {
  return {
    ...productItem(),
    imageUrl: images.find((entry) => entry.isPrimary)?.imageUrl ?? null,
    images,
  };
}

function imageRow(overrides: Partial<ProductImageDto> = {}): ProductImageDto {
  const sortOrder = overrides.sortOrder ?? 0;
  return {
    id: `img-${sortOrder + 1}`,
    imageUrl: `https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/products/p-1/hash-${sortOrder}.jpg`,
    altText: null,
    sortOrder,
    isPrimary: sortOrder === 0,
    ...overrides,
  };
}

function categoryRow(overrides: Partial<CategoryDto> = {}): CategoryDto {
  return {
    id: 'c-1',
    name: 'Biryani',
    slug: 'biryani',
    description: null,
    imageUrl: null,
    status: 'ACTIVE',
    sortOrder: 1,
    ...overrides,
  };
}

function jpegFile(): File {
  return new File(['fake-jpeg-bytes'], 'biryani.jpg', { type: 'image/jpeg' });
}

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.productsApi.listAdmin.mockResolvedValue([productItem()]);
  MOCK_APIS.categoriesApi.listAdmin.mockResolvedValue([categoryRow()]);
  MOCK_APIS.productsApi.getAdmin.mockResolvedValue(productDetail());
});

describe('admin catalogue product media', () => {
  it('uploads the first image and it becomes the primary product image', async () => {
    MOCK_APIS.productsApi.uploadImage.mockResolvedValue(productDetail([imageRow()]));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    expect(screen.getByText('No images yet.')).toBeInTheDocument();

    const file = jpegFile();
    await user.upload(screen.getByLabelText('Choose product image'), file);
    await user.click(screen.getByRole('button', { name: 'Upload image' }));

    await waitFor(() =>
      expect(MOCK_APIS.productsApi.uploadImage).toHaveBeenCalledWith(
        'p-1',
        file,
        undefined,
        'test-token',
      ),
    );
    expect(await screen.findByText('Primary')).toBeInTheDocument();
  });

  it('passes alt text through on upload', async () => {
    MOCK_APIS.productsApi.uploadImage.mockResolvedValue(productDetail([imageRow()]));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    await user.upload(within(dialog).getByLabelText('Choose product image'), jpegFile());
    await user.type(within(dialog).getByLabelText('Alt text'), 'Crunchy biryani');
    await user.click(within(dialog).getByRole('button', { name: 'Upload image' }));

    await waitFor(() =>
      expect(MOCK_APIS.productsApi.uploadImage).toHaveBeenCalledWith(
        'p-1',
        expect.any(File),
        'Crunchy biryani',
        'test-token',
      ),
    );
  });

  it('rejects an oversized image before hitting the API', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Choose product image'), big);
    await user.click(within(dialog).getByRole('button', { name: 'Upload image' }));

    expect(await screen.findByText('Image must be 5 MB or smaller.')).toBeInTheDocument();
    expect(MOCK_APIS.productsApi.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects a non-JPEG/PNG/WebP file before hitting the API', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    await user.upload(
      within(dialog).getByLabelText('Choose product image'),
      new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Upload image' }));

    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeInTheDocument();
    expect(MOCK_APIS.productsApi.uploadImage).not.toHaveBeenCalled();
  });

  it('shows the image counter and disables uploads at the maximum of three', async () => {
    MOCK_APIS.productsApi.getAdmin.mockResolvedValue(
      productDetail([imageRow(), imageRow({ sortOrder: 1 }), imageRow({ sortOrder: 2 })]),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    expect(within(dialog).getByText(/3 of 3 images/)).toBeInTheDocument();
    expect(within(dialog).getByText('Maximum of 3 images reached.')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Choose product image')).not.toBeInTheDocument();
  });

  it('marks another uploaded image as primary', async () => {
    MOCK_APIS.productsApi.getAdmin.mockResolvedValue(
      productDetail([imageRow(), imageRow({ sortOrder: 1 })]),
    );
    MOCK_APIS.productsApi.setPrimaryImage.mockResolvedValue(
      productDetail([
        imageRow({ sortOrder: 0, isPrimary: false }),
        imageRow({ sortOrder: 1, isPrimary: true }),
      ]),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    await user.click(within(dialog).getByRole('button', { name: 'Make primary' }));

    await waitFor(() =>
      expect(MOCK_APIS.productsApi.setPrimaryImage).toHaveBeenCalledWith('img-2', 'test-token'),
    );
  });

  it('reorders images with Move up while keeping the first position locked', async () => {
    MOCK_APIS.productsApi.getAdmin.mockResolvedValue(
      productDetail([imageRow(), imageRow({ sortOrder: 1 }), imageRow({ sortOrder: 2 })]),
    );
    MOCK_APIS.productsApi.reorderImages.mockResolvedValue(
      productDetail([imageRow(), imageRow({ sortOrder: 2 }), imageRow({ sortOrder: 1 })]),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    await user.click(within(dialog).getAllByRole('button', { name: 'Move up' })[1]);

    await waitFor(() =>
      expect(MOCK_APIS.productsApi.reorderImages).toHaveBeenCalledWith(
        { orderedImageIds: ['img-2', 'img-1', 'img-3'] },
        'test-token',
      ),
    );
  });

  it('disables Move down on the last image', async () => {
    MOCK_APIS.productsApi.getAdmin.mockResolvedValue(
      productDetail([imageRow(), imageRow({ sortOrder: 1 }), imageRow({ sortOrder: 2 })]),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    const moveDown = within(dialog).getAllByRole('button', { name: 'Move down' });
    expect(moveDown[0]).toBeEnabled();
    expect(moveDown[2]).toBeDisabled();
  });

  it('removes an image after confirmation', async () => {
    MOCK_APIS.productsApi.getAdmin.mockResolvedValue(
      productDetail([imageRow(), imageRow({ sortOrder: 1 })]),
    );
    MOCK_APIS.productsApi.removeImage.mockResolvedValue(
      productDetail([imageRow({ sortOrder: 1, isPrimary: true })]),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    await user.click(within(dialog).getAllByRole('button', { name: 'Remove' })[0]);

    const confirm = await screen.findByRole('dialog', { name: 'Remove this image?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove image' }));

    await waitFor(() =>
      expect(MOCK_APIS.productsApi.removeImage).toHaveBeenCalledWith('img-1', 'test-token'),
    );
  });

  it('surfaces an upload failure back to the admin', async () => {
    MOCK_APIS.productsApi.uploadImage.mockRejectedValue(
      new MOCK_APIS.ApiError('Upload failed', 503),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Chicken Biryani' });
    await user.upload(within(dialog).getByLabelText('Choose product image'), jpegFile());
    await user.click(within(dialog).getByRole('button', { name: 'Upload image' }));

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
  });
});

describe('admin catalogue category media', () => {
  it('uploads, replaces and removes a category image from the edit modal', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Categories' }));
    await screen.findByText('Biryani');
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    let dialog = await screen.findByRole('dialog', { name: 'Edit Biryani' });
    expect(within(dialog).getByText('No image yet.')).toBeInTheDocument();

    const replaced = categoryRow({
      imageUrl:
        'https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/categories/c-1/hash.jpg',
    });
    MOCK_APIS.categoriesApi.uploadImage.mockResolvedValue(replaced);
    await user.upload(within(dialog).getByLabelText('Choose category image'), jpegFile());
    await user.click(within(dialog).getByRole('button', { name: 'Upload image' }));
    await waitFor(() =>
      expect(MOCK_APIS.categoriesApi.uploadImage).toHaveBeenCalledWith(
        'c-1',
        expect.any(File),
        'test-token',
      ),
    );

    dialog = await screen.findByRole('dialog', { name: 'Edit Biryani' });
    expect(within(dialog).getByRole('img', { name: 'Biryani' })).toBeInTheDocument();

    MOCK_APIS.categoriesApi.removeImage.mockResolvedValue(categoryRow());
    await user.click(within(dialog).getByRole('button', { name: 'Remove image' }));
    await waitFor(() =>
      expect(MOCK_APIS.categoriesApi.removeImage).toHaveBeenCalledWith('c-1', 'test-token'),
    );
    expect(await screen.findByText('No image yet.')).toBeInTheDocument();
  });

  it('shows the category thumbnail in the list when one exists', async () => {
    MOCK_APIS.categoriesApi.listAdmin.mockResolvedValue([
      categoryRow({
        imageUrl:
          'https://res.cloudinary.com/hungrybox/image/upload/v1/hungry-box/catalog/categories/c-1/hash.jpg',
      }),
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );

    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Categories' }));

    expect(await screen.findByRole('img', { name: 'Biryani' })).toBeInTheDocument();
  });
});

describe('admin catalogue product creation with an image', () => {
  function createdProduct(): GlobalProductDetailDto {
    return {
      ...productItem(),
      id: 'p-2',
      name: 'Masala Chai',
      slug: 'masala-chai',
      imageUrl: null,
      images: [],
    };
  }

  async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
    render(
      <MemoryRouter>
        <AdminCataloguePage />
      </MemoryRouter>,
    );
    await screen.findByText('Chicken Biryani');
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    return screen.findByRole('dialog', { name: 'Add product' });
  }

  it('previews the chosen image inside the add dialog before the product exists', async () => {
    const user = userEvent.setup();
    const dialog = await openAddDialog(user);

    expect(within(dialog).getByText('Product image (optional)')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('image-field-preview')).not.toBeInTheDocument();

    await user.upload(within(dialog).getByLabelText('Choose new product image'), jpegFile());

    expect(within(dialog).getByTestId('image-field-preview')).toBeInTheDocument();
  });

  it('creates the product and then uploads the staged image to it', async () => {
    MOCK_APIS.productsApi.create.mockResolvedValue(createdProduct());
    MOCK_APIS.productsApi.uploadImage.mockResolvedValue(createdProduct());
    const user = userEvent.setup();
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText('Name'), 'Masala Chai');
    await user.upload(within(dialog).getByLabelText('Choose new product image'), jpegFile());
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(MOCK_APIS.productsApi.create).toHaveBeenCalled());
    await waitFor(() =>
      expect(MOCK_APIS.productsApi.uploadImage).toHaveBeenCalledWith(
        'p-2',
        expect.any(File),
        undefined,
        'test-token',
      ),
    );
    expect(await screen.findByText('Product created with its image.')).toBeInTheDocument();
  });

  it('sends the image description when one is provided', async () => {
    MOCK_APIS.productsApi.create.mockResolvedValue(createdProduct());
    MOCK_APIS.productsApi.uploadImage.mockResolvedValue(createdProduct());
    const user = userEvent.setup();
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText('Name'), 'Masala Chai');
    await user.upload(within(dialog).getByLabelText('Choose new product image'), jpegFile());
    await user.type(
      within(dialog).getByLabelText('Description for this image (optional)'),
      'Hot masala chai',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    await waitFor(() =>
      expect(MOCK_APIS.productsApi.uploadImage).toHaveBeenCalledWith(
        'p-2',
        expect.any(File),
        'Hot masala chai',
        'test-token',
      ),
    );
  });

  it('creates the product without any API image call when no image is staged', async () => {
    MOCK_APIS.productsApi.create.mockResolvedValue(createdProduct());
    const user = userEvent.setup();
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText('Name'), 'Masala Chai');
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(MOCK_APIS.productsApi.create).toHaveBeenCalled());
    expect(MOCK_APIS.productsApi.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects a staged non-image before creating anything', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText('Name'), 'Masala Chai');
    await user.upload(
      within(dialog).getByLabelText('Choose new product image'),
      new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    expect(
      await within(dialog).findByText('Choose a JPEG, PNG or WebP image.'),
    ).toBeInTheDocument();
    expect(MOCK_APIS.productsApi.create).not.toHaveBeenCalled();
  });

  it('rejects a staged oversized image before creating anything', async () => {
    const user = userEvent.setup();
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText('Name'), 'Masala Chai');
    await user.upload(
      within(dialog).getByLabelText('Choose new product image'),
      new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    expect(await within(dialog).findByText('Image must be 5 MB or smaller.')).toBeInTheDocument();
    expect(MOCK_APIS.productsApi.create).not.toHaveBeenCalled();
  });

  it('reports an honest partial success when the product is created but the image upload fails', async () => {
    MOCK_APIS.productsApi.create.mockResolvedValue(createdProduct());
    MOCK_APIS.productsApi.uploadImage.mockRejectedValue(
      new MOCK_APIS.ApiError('Upload failed', 503),
    );
    const user = userEvent.setup();
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText('Name'), 'Masala Chai');
    await user.upload(within(dialog).getByLabelText('Choose new product image'), jpegFile());
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    await waitFor(() =>
      expect(MOCK_APIS.productsApi.uploadImage).toHaveBeenCalledWith(
        'p-2',
        expect.any(File),
        undefined,
        'test-token',
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Product created, but its image was not uploaded/,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Open the product to add the image again/);
  });

  it('closes and resets the add dialog after a successful create', async () => {
    MOCK_APIS.productsApi.create.mockResolvedValue(createdProduct());
    const user = userEvent.setup();
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText('Name'), 'Masala Chai');
    await user.upload(within(dialog).getByLabelText('Choose new product image'), jpegFile());
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add product' })).not.toBeInTheDocument(),
    );
  });
});

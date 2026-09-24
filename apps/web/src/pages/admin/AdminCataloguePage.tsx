import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type {
  CatalogStatus,
  CategoryDto,
  GlobalProductDetailDto,
  GlobalProductListItemDto,
  ProductImageDto,
} from '@hungrybox/shared';
import { categoriesApi, productsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../features/storefront/components/EmptyState';
import {
  CloseIcon,
  PackageIcon,
  PlusIcon,
  TrashIcon,
} from '../../features/storefront/components/icons';
import AdminLayout from './AdminLayout';

type ProductForm = { name: string; slug: string; description: string; categoryId: string };

type CategoryForm = { name: string; slug: string; description: string; sortOrder: string };

type CategoryModalState = { mode: 'create' } | { mode: 'edit'; category: CategoryDto };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function StatusBadge({ status }: { status: CatalogStatus }): JSX.Element {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
        status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {status}
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalogue-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="catalogue-modal-title" className="text-lg font-bold text-brand-navy">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminCataloguePage(): JSX.Element {
  const { token } = useAuth();
  const [view, setView] = useState<'products' | 'categories'>('products');
  const [products, setProducts] = useState<GlobalProductListItemDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<ProductForm>({
    name: '',
    slug: '',
    description: '',
    categoryId: '',
  });

  const [editing, setEditing] = useState<GlobalProductListItemDto | null>(null);
  const [detail, setDetail] = useState<GlobalProductDetailDto | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState<ProductForm>({
    name: '',
    slug: '',
    description: '',
    categoryId: '',
  });
  const [detailError, setDetailError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [removeImage, setRemoveImage] = useState<ProductImageDto | null>(null);

  const [toggleProduct, setToggleProduct] = useState<GlobalProductListItemDto | null>(null);

  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    name: '',
    slug: '',
    description: '',
    sortOrder: '0',
  });
  const [categorySaving, setCategorySaving] = useState(false);
  const [toggleCategory, setToggleCategory] = useState<CategoryDto | null>(null);

  const modalOpen = addOpen || editing !== null || categoryModal !== null;

  const refreshProducts = useCallback(() => {
    if (!token) return;
    setProductsLoading(true);
    setError(null);
    Promise.all([productsApi.listAdmin(token), categoriesApi.listAdmin(token)])
      .then(([productList, categoryList]) => {
        setProducts(productList);
        setCategories(categoryList);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load the catalogue.');
      })
      .finally(() => setProductsLoading(false));
  }, [token]);

  const refreshCategories = useCallback(() => {
    if (!token) return;
    setCategoriesLoading(true);
    setError(null);
    categoriesApi
      .listAdmin(token)
      .then(setCategories)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load categories.');
      })
      .finally(() => setCategoriesLoading(false));
  }, [token]);

  useEffect(() => {
    if (view === 'products') {
      refreshProducts();
    } else {
      refreshCategories();
    }
  }, [view, refreshCategories, refreshProducts]);

  const openAdd = (): void => {
    setAddForm({ name: '', slug: '', description: '', categoryId: '' });
    setError(null);
    setSuccess(null);
    setAddOpen(true);
  };

  const handleAddName = (name: string): void => {
    setAddForm((current) => {
      const auto = slugify(name);
      const keptSlug = current.slug.length > 0 && current.slug !== slugify(current.name);
      return { ...current, name, slug: keptSlug ? current.slug : auto };
    });
  };

  const submitAdd = (): void => {
    if (!token) return;
    const name = addForm.name.trim();
    const slug = addForm.slug.trim();
    if (!name) {
      setError('Product name is required.');
      return;
    }
    if (!slug) {
      setError('Product slug is required.');
      return;
    }
    setSaving(true);
    setError(null);
    productsApi
      .create(
        {
          name,
          slug,
          description: addForm.description.trim() || undefined,
          categoryId: addForm.categoryId || undefined,
        },
        token,
      )
      .then(() => {
        setAddOpen(false);
        setSuccess('Product created.');
        refreshProducts();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not create the product.');
      })
      .finally(() => setSaving(false));
  };

  const openEdit = (product: GlobalProductListItemDto): void => {
    if (!token) return;
    setEditing(product);
    setDetail(null);
    setEditLoading(true);
    setDetailError(null);
    setImageUrl('');
    setImageAlt('');
    setError(null);
    setSuccess(null);
    productsApi
      .getAdmin(product.id, token)
      .then((data) => {
        setDetail(data);
        setEditForm({
          name: data.name,
          slug: data.slug,
          description: data.description ?? '',
          categoryId: data.categoryId ?? '',
        });
      })
      .catch((err: unknown) => {
        setDetailError(err instanceof Error ? err.message : 'Could not load the product.');
      })
      .finally(() => setEditLoading(false));
  };

  const closeEdit = (): void => {
    setEditing(null);
    setDetail(null);
    setDetailError(null);
    refreshProducts();
  };

  const submitEdit = (): void => {
    if (!token || !editing) return;
    const name = editForm.name.trim();
    const slug = editForm.slug.trim();
    if (!name) {
      setDetailError('Product name is required.');
      return;
    }
    if (!slug) {
      setDetailError('Product slug is required.');
      return;
    }
    setSaving(true);
    setDetailError(null);
    productsApi
      .update(
        editing.id,
        {
          name,
          slug,
          description: editForm.description.trim() || null,
          categoryId: editForm.categoryId || null,
        },
        token,
      )
      .then((updated) => {
        setDetail(updated);
        setEditForm({
          name: updated.name,
          slug: updated.slug,
          description: updated.description ?? '',
          categoryId: updated.categoryId ?? '',
        });
        setSuccess('Product updated.');
      })
      .catch((err: unknown) => {
        setDetailError(err instanceof Error ? err.message : 'Could not save the product.');
      })
      .finally(() => setSaving(false));
  };

  const submitMakePrimary = (image: ProductImageDto): void => {
    if (!token || !editing) return;
    setImageBusy(true);
    setDetailError(null);
    productsApi
      .updateImage(image.id, { isPrimary: true }, token)
      .then((updated) => {
        setDetail(updated);
        refreshProducts();
      })
      .catch((err: unknown) => {
        setDetailError(err instanceof Error ? err.message : 'Could not update the image.');
      })
      .finally(() => setImageBusy(false));
  };

  const submitRemoveImage = (): void => {
    if (!token || !editing || !removeImage) return;
    setImageBusy(true);
    setDetailError(null);
    productsApi
      .removeImage(removeImage.id, token)
      .then((updated) => {
        setDetail(updated);
        setRemoveImage(null);
        refreshProducts();
      })
      .catch((err: unknown) => {
        setDetailError(err instanceof Error ? err.message : 'Could not remove the image.');
      })
      .finally(() => setImageBusy(false));
  };

  const submitAddImage = (): void => {
    if (!token || !editing) return;
    const url = imageUrl.trim();
    if (!url) {
      setDetailError('Image URL is required.');
      return;
    }
    setImageBusy(true);
    setDetailError(null);
    productsApi
      .addImage(editing.id, { imageUrl: url, altText: imageAlt.trim() || undefined }, token)
      .then((updated) => {
        setDetail(updated);
        setImageUrl('');
        setImageAlt('');
        refreshProducts();
      })
      .catch((err: unknown) => {
        setDetailError(err instanceof Error ? err.message : 'Could not add the image.');
      })
      .finally(() => setImageBusy(false));
  };

  const setProductStatus = (product: GlobalProductListItemDto, status: CatalogStatus): void => {
    if (!token) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    productsApi
      .setStatus(product.id, { status }, token)
      .then(() => {
        setToggleProduct(null);
        setSuccess(status === 'ACTIVE' ? 'Product activated.' : 'Product deactivated.');
        refreshProducts();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not update the product status.');
      })
      .finally(() => setSaving(false));
  };

  const submitDeactivateProduct = (): void => {
    if (toggleProduct) {
      setProductStatus(toggleProduct, 'INACTIVE');
    }
  };

  const openCreateCategory = (): void => {
    setCategoryForm({ name: '', slug: '', description: '', sortOrder: '0' });
    setError(null);
    setSuccess(null);
    setCategoryModal({ mode: 'create' });
  };

  const openEditCategory = (category: CategoryDto): void => {
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      sortOrder: String(category.sortOrder),
    });
    setError(null);
    setSuccess(null);
    setCategoryModal({ mode: 'edit', category });
  };

  const handleCategoryName = (name: string): void => {
    if (categoryModal?.mode !== 'create') {
      setCategoryForm((current) => ({ ...current, name }));
      return;
    }
    setCategoryForm((current) => {
      const auto = slugify(name);
      const keptSlug = current.slug.length > 0 && current.slug !== slugify(current.name);
      return { ...current, name, slug: keptSlug ? current.slug : auto };
    });
  };

  const submitCategory = (): void => {
    if (!token || !categoryModal) return;
    const name = categoryForm.name.trim();
    if (!name) {
      setError('Category name is required.');
      return;
    }
    setCategorySaving(true);
    setError(null);
    const input = {
      name,
      slug: categoryForm.slug.trim() || undefined,
      description: categoryForm.description.trim() || undefined,
      sortOrder: Number(categoryForm.sortOrder) || 0,
    };
    const mode = categoryModal.mode;
    let request: Promise<CategoryDto>;
    if (categoryModal.mode === 'create') {
      request = categoriesApi.create(input, token);
    } else {
      request = categoriesApi.update(categoryModal.category.id, input, token);
    }
    request
      .then(() => {
        setCategoryModal(null);
        setSuccess(mode === 'create' ? 'Category created.' : 'Category updated.');
        refreshCategories();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the category.');
      })
      .finally(() => setCategorySaving(false));
  };

  const setCategoryStatus = (category: CategoryDto, status: CatalogStatus): void => {
    if (!token) return;
    setCategorySaving(true);
    setError(null);
    setSuccess(null);
    categoriesApi
      .update(category.id, { status }, token)
      .then(() => {
        setToggleCategory(null);
        setSuccess(status === 'ACTIVE' ? 'Category activated.' : 'Category deactivated.');
        refreshCategories();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not update the category status.');
      })
      .finally(() => setCategorySaving(false));
  };

  const submitToggleCategory = (): void => {
    if (toggleCategory) {
      setCategoryStatus(toggleCategory, toggleCategory.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
    }
  };

  return (
    <AdminLayout kicker="Global catalogue" title="Catalogue">
      <div className="mt-6 inline-flex gap-1 rounded-xl border border-slate-300 bg-white p-1">
        <button
          type="button"
          onClick={() => setView('products')}
          className={
            view === 'products'
              ? 'rounded-lg bg-brand-teal px-4 py-2 text-sm font-bold text-white'
              : 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:border-brand-teal'
          }
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => setView('categories')}
          className={
            view === 'categories'
              ? 'rounded-lg bg-brand-teal px-4 py-2 text-sm font-bold text-white'
              : 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:border-brand-teal'
          }
        >
          Categories
        </button>
      </div>

      {!modalOpen && error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {!modalOpen && success ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {view === 'products' ? (
        <div className="mt-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-teal/90"
            >
              <PlusIcon className="h-4 w-4" />
              Add product
            </button>
          </div>
          {productsLoading ? (
            <p className="mt-6 text-sm text-slate-500">Loading products…</p>
          ) : products.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                icon={<PackageIcon className="h-8 w-8" />}
                title="No products"
                message="Add products to build the global catalogue."
              />
            </div>
          ) : (
            <ul className="mt-6 grid gap-3 xl:grid-cols-2">
              {products.map((product) => (
                <li key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <PackageIcon className="h-8 w-8" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-brand-navy">{product.name}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                        /{product.slug}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {product.categoryName ? (
                          <span className="rounded-full bg-brand-sky/60 px-2.5 py-1 text-xs font-bold text-brand-navy">
                            {product.categoryName}
                          </span>
                        ) : null}
                        <StatusBadge status={product.status} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
                        className="rounded-lg bg-brand-teal px-3 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90"
                      >
                        Edit
                      </button>
                      {product.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => setToggleProduct(product)}
                          disabled={saving}
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setProductStatus(product, 'ACTIVE')}
                          disabled={saving}
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openCreateCategory}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-teal/90"
            >
              <PlusIcon className="h-4 w-4" />
              Add category
            </button>
          </div>
          {categoriesLoading ? (
            <p className="mt-6 text-sm text-slate-500">Loading categories…</p>
          ) : categories.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                icon={<PackageIcon className="h-8 w-8" />}
                title="No categories"
                message="Add categories to organise the global catalogue."
              />
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-brand-navy">{category.name}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                        {category.sortOrder}
                      </span>
                      <StatusBadge status={category.status} />
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                      /{category.slug}
                    </p>
                    {category.description ? (
                      <p className="mt-1 text-sm text-slate-600">{category.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEditCategory(category)}
                      className="rounded-lg bg-brand-teal px-3 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90"
                    >
                      Edit
                    </button>
                    {category.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        onClick={() => setToggleCategory(category)}
                        disabled={categorySaving}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setToggleCategory(category)}
                        disabled={categorySaving}
                        className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {addOpen ? (
        <Modal
          title="Add product"
          onClose={() => {
            if (!saving) setAddOpen(false);
          }}
        >
          {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Name
              <input
                value={addForm.name}
                onChange={(event) => handleAddName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Slug
              <input
                value={addForm.slug}
                onChange={(event) => setAddForm({ ...addForm, slug: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Description
              <textarea
                value={addForm.description}
                onChange={(event) => setAddForm({ ...addForm, description: event.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Category
              <select
                value={addForm.categoryId}
                onChange={(event) => setAddForm({ ...addForm, categoryId: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              disabled={saving}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitAdd}
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90 disabled:opacity-50"
            >
              Add product
            </button>
          </div>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Edit ${editing.name}`} onClose={closeEdit}>
          {detailError ? (
            <p className="mt-4 text-sm font-semibold text-red-600">{detailError}</p>
          ) : null}
          {success ? (
            <p className="mt-4 text-sm font-semibold text-emerald-600">{success}</p>
          ) : null}
          {editLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading product…</p>
          ) : detail ? (
            <>
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Name
                  <input
                    value={editForm.name}
                    onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Slug
                  <input
                    value={editForm.slug}
                    onChange={(event) => setEditForm({ ...editForm, slug: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Description
                  <textarea
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm({ ...editForm, description: event.target.value })
                    }
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Category
                  <select
                    value={editForm.categoryId}
                    onChange={(event) =>
                      setEditForm({ ...editForm, categoryId: event.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving || imageBusy}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90 disabled:opacity-50"
                >
                  Save changes
                </button>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Product images
                </h3>
                {detail.images.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No images yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {[...detail.images]
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((image) => (
                        <li
                          key={image.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                        >
                          <img
                            src={image.imageUrl}
                            alt={image.altText ?? ''}
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-slate-600">
                              {image.altText ?? '—'}
                            </p>
                            {image.isPrimary ? (
                              <span className="mt-1 inline-block rounded-full bg-brand-teal px-2 py-0.5 text-xs font-bold text-white">
                                Primary
                              </span>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {!image.isPrimary ? (
                              <button
                                type="button"
                                onClick={() => submitMakePrimary(image)}
                                disabled={imageBusy}
                                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-50"
                              >
                                Make primary
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setRemoveImage(image)}
                              disabled={imageBusy}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}

                <div className="mt-4 space-y-2">
                  <input
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="https://image-url"
                    aria-label="Image URL"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={imageAlt}
                    onChange={(event) => setImageAlt(event.target.value)}
                    placeholder="Alt text (optional)"
                    aria-label="Alt text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={submitAddImage}
                    disabled={imageBusy}
                    className="rounded-lg bg-brand-teal px-3 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90 disabled:opacity-50"
                  >
                    Add image
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Could not load the product.</p>
          )}
        </Modal>
      ) : null}

      {categoryModal ? (
        <Modal
          title={
            categoryModal.mode === 'create' ? 'Add category' : `Edit ${categoryModal.category.name}`
          }
          onClose={() => {
            if (!categorySaving) setCategoryModal(null);
          }}
        >
          {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Name
              <input
                value={categoryForm.name}
                onChange={(event) => handleCategoryName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Slug
              <input
                value={categoryForm.slug}
                onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Description
              <textarea
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, description: event.target.value })
                }
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Sort order
              <input
                type="number"
                value={categoryForm.sortOrder}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, sortOrder: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setCategoryModal(null)}
              disabled={categorySaving}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCategory}
              disabled={categorySaving}
              className="flex-1 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90 disabled:opacity-50"
            >
              {categoryModal.mode === 'create' ? 'Add category' : 'Save changes'}
            </button>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={toggleProduct !== null}
        title="Deactivate this product?"
        description={`${toggleProduct?.name ?? 'This product'} will be disabled across all branches.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={submitDeactivateProduct}
        onClose={() => setToggleProduct(null)}
      />

      <ConfirmDialog
        open={removeImage !== null}
        title="Remove this image?"
        description="The image will be removed from this product."
        confirmLabel="Remove image"
        danger
        onConfirm={submitRemoveImage}
        onClose={() => setRemoveImage(null)}
      />

      <ConfirmDialog
        open={toggleCategory !== null}
        title={
          toggleCategory?.status === 'ACTIVE'
            ? 'Deactivate this category?'
            : 'Activate this category?'
        }
        description={`${toggleCategory?.name ?? 'This category'} will be ${
          toggleCategory?.status === 'ACTIVE' ? 'deactivated' : 'activated'
        } across the catalogue.`}
        confirmLabel={toggleCategory?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        danger={toggleCategory?.status === 'ACTIVE'}
        onConfirm={submitToggleCategory}
        onClose={() => setToggleCategory(null)}
      />
    </AdminLayout>
  );
}

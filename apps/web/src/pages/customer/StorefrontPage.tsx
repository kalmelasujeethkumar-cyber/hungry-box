import { useState } from 'react';
import type { JSX } from 'react';
import type { CatalogProduct, CatalogProductDetail } from '@hungrybox/shared';
import { catalogApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { useCart } from '../../features/storefront/cart-context';
import CategoryChips from '../../features/storefront/components/CategoryChips';
import EmptyState from '../../features/storefront/components/EmptyState';
import LocationBanner from '../../features/storefront/components/LocationBanner';
import ProductDetailModal from '../../features/storefront/components/ProductDetailModal';
import ProductGrid from '../../features/storefront/components/ProductGrid';
import SearchBar from '../../features/storefront/components/SearchBar';
import ServiceabilityBanner from '../../features/storefront/components/ServiceabilityBanner';
import { PackageIcon } from '../../features/storefront/components/icons';
import { useStorefront } from '../../features/storefront/storefront-context';

export default function StorefrontPage(): JSX.Element {
  const { token } = useAuth();
  const { products, loadingCatalog, catalogError, status, branchId, setLocationsOpen } =
    useStorefront();
  const { cart, addItem, updateQuantity, removeItem } = useCart();
  const [detail, setDetail] = useState<CatalogProductDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function handleAdd(product: CatalogProduct): Promise<void> {
    await addItem(product.productId, 1);
  }

  async function handleUpdateQuantity(product: CatalogProduct, quantity: number): Promise<void> {
    const item = cart?.items.find((entry) => entry.productId === product.productId);
    if (!item) {
      if (quantity > 0) await addItem(product.productId, quantity);
      return;
    }
    if (quantity <= 0) {
      await removeItem(item.id);
    } else {
      await updateQuantity(item.id, quantity);
    }
  }

  async function handleView(product: CatalogProduct): Promise<void> {
    if (!branchId || !token) return;
    setDetailError(null);
    try {
      setDetail(await catalogApi.getProduct(product.productId, branchId, token));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Could not load product');
    }
  }

  const showContent = status === 'ready' && branchId;

  return (
    <div className="space-y-4">
      <LocationBanner />
      <ServiceabilityBanner />

      {showContent ? (
        <>
          <SearchBar />
          <CategoryChips />
          {catalogError ? (
            <div
              className="rounded-2xl border border-brand-orange/40 bg-brand-orange/10 p-4 text-sm font-semibold text-slate-700"
              role="alert"
            >
              {catalogError}
            </div>
          ) : loadingCatalog ? (
            <ProductSkeleton aria-label="Loading menu" />
          ) : products.length === 0 ? (
            <EmptyState
              icon={<PackageIcon className="h-8 w-8" />}
              title="No items yet"
              message="We could not find anything matching your search. Try a different keyword or category."
            />
          ) : (
            <ProductGrid
              products={products}
              onAdd={handleAdd}
              onUpdateQuantity={handleUpdateQuantity}
              onView={handleView}
            />
          )}
        </>
      ) : null}

      {detail ? (
        <ProductDetailModal
          detail={detail}
          onClose={() => setDetail(null)}
          onAdd={(productId) => void addItem(productId, 1)}
          onUpdateQuantity={async (productId, quantity) => {
            if (quantity <= 0) {
              const item = cart?.items.find((entry) => entry.productId === productId);
              if (item) await removeItem(item.id);
              return;
            }
            const item = cart?.items.find((entry) => entry.productId === productId);
            if (item) await updateQuantity(item.id, quantity);
          }}
        />
      ) : null}

      {detailError ? (
        <div
          className="rounded-2xl border border-brand-orange/40 bg-brand-orange/10 p-4 text-sm font-semibold text-slate-700"
          role="alert"
        >
          {detailError}
        </div>
      ) : null}

      {status === 'idle' || status === 'error' ? (
        <EmptyState
          icon={<PackageIcon className="h-8 w-8" />}
          title="The menu is waiting"
          message="Set your delivery location to see what is cooking near you."
          action={
            <button
              type="button"
              onClick={() => setLocationsOpen(true)}
              className="rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-orange/90"
            >
              Set delivery location
            </button>
          }
        />
      ) : null}
    </div>
  );
}

function ProductSkeleton(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading menu">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="flex h-32 animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <div className="h-full w-28 bg-slate-200" />
          <div className="flex-1 space-y-2 p-3">
            <div className="h-3 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-200" />
            <div className="h-4 w-1/3 rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

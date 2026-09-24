import type { JSX } from 'react';
import type { CatalogProduct } from '@hungrybox/shared';
import ProductCard from './ProductCard';

export default function ProductGrid({
  products,
  onAdd,
  onUpdateQuantity,
  onView,
}: {
  products: CatalogProduct[];
  onAdd: (product: CatalogProduct) => void;
  onUpdateQuantity: (product: CatalogProduct, quantity: number) => void;
  onView: (product: CatalogProduct) => void;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard
          key={product.productId}
          product={product}
          onAdd={onAdd}
          onUpdateQuantity={onUpdateQuantity}
          onView={onView}
        />
      ))}
    </div>
  );
}

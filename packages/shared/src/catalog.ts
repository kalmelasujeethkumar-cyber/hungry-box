export interface CatalogProduct {
  productId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  imageUrl: string | null;
  priceMinor: number;
  discountMinor: number;
  effectivePriceMinor: number;
  isAvailable: boolean;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface ProductImageDto {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface CatalogProductDetail {
  productId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  images: ProductImageDto[];
  imageUrl: string | null;
  priceMinor: number;
  discountMinor: number;
  effectivePriceMinor: number;
  isAvailable: boolean;
}

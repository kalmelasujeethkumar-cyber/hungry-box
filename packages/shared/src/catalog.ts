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

export type BranchProductStatus = 'ACTIVE' | 'INACTIVE';

export interface BranchProductDto {
  id: string;
  productId: string;
  priceMinor: number;
  discountMinor: number;
  effectivePriceMinor: number;
  isAvailable: boolean;
  status: BranchProductStatus;
  product: {
    name: string;
    slug: string;
    categoryName: string | null;
    categorySlug: string | null;
  };
}

export interface UpdateBranchProductInput {
  priceMinor?: number;
  discountMinor?: number;
  isAvailable?: boolean;
  status?: BranchProductStatus;
}

export type CatalogStatus = 'ACTIVE' | 'INACTIVE';

export interface GlobalProductListItemDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  status: CatalogStatus;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalProductDetailDto extends GlobalProductListItemDto {
  images: ProductImageDto[];
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  description?: string | null;
  categoryId?: string | null;
  status?: CatalogStatus;
}

export interface SetProductStatusInput {
  status: CatalogStatus;
}

export interface ReorderProductImagesInput {
  orderedImageIds: string[];
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  status: CatalogStatus;
  sortOrder: number;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
  status?: CatalogStatus;
}

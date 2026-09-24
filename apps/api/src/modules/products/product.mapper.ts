import type {
  GlobalProductDetailDto,
  GlobalProductListItemDto,
  ProductImageDto,
} from '@hungrybox/shared';

export interface ProductReference {
  id: string;
  name: string;
  slug: string;
}

export interface ProductImageReference {
  imageUrl: string;
  altText: string | null;
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  category: ProductReference | null;
  primaryImage: ProductImageReference | null;
}

export interface ProductDetail extends ProductSummary {
  images: ProductImageReference[];
}

export const productSummarySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  status: true,
  category: {
    select: { id: true, name: true, slug: true },
  },
  images: {
    where: { isPrimary: true },
    take: 1,
    select: { imageUrl: true, altText: true },
  },
} as const;

export interface ProductImageRow {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductAdminRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  category: ProductReference | null;
  createdAt: Date;
  updatedAt: Date;
  images: ProductImageRow[];
}

export const productAdminSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  status: true,
  category: {
    select: { id: true, name: true, slug: true },
  },
  createdAt: true,
  updatedAt: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      imageUrl: true,
      altText: true,
      sortOrder: true,
      isPrimary: true,
    },
  },
} as const;

function toProductImages(images: ProductImageRow[]): ProductImageDto[] {
  return images.map((image) => ({
    id: image.id,
    imageUrl: image.imageUrl,
    altText: image.altText,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
  }));
}

export function toGlobalProductListItem(row: ProductAdminRow): GlobalProductListItemDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
    status: row.status,
    imageUrl: row.images.find((image) => image.isPrimary)?.imageUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toGlobalProductDetail(row: ProductAdminRow): GlobalProductDetailDto {
  return {
    ...toGlobalProductListItem(row),
    images: toProductImages(row.images),
  };
}

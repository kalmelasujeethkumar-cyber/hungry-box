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

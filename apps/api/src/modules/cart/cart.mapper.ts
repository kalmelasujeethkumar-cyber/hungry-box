import type { CartBranch, CartItemDto, CartSummary } from '@hungrybox/shared';
import type { Prisma } from '../../generated/prisma/client';
import { resolveCatalogImageUrl } from '../../common/utils/catalog-image';

const catalogImageFields = {
  imageUrl: true,
  isPrimary: true,
  sortOrder: true,
} as const;

export const cartWithItemsSelect = {
  id: true,
  branch: { select: { id: true, name: true, code: true, city: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      quantity: true,
      unitPriceMinor: true,
      unitDiscountMinor: true,
      branchProduct: {
        select: {
          id: true,
          images: { orderBy: { sortOrder: 'asc' }, select: catalogImageFields },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              category: { select: { name: true, imageUrl: true } },
              images: { orderBy: { sortOrder: 'asc' }, select: catalogImageFields },
            },
          },
        },
      },
    },
  },
} as const;

export type CartWithItems = Prisma.CartGetPayload<{ select: typeof cartWithItemsSelect }>;
export type CartItemWithProduct = CartWithItems['items'][number];

export interface CartBranchSource {
  id: string;
  name: string;
  code: string;
  city: string;
}

export function toCartSummary(cart: CartWithItems | null, branch: CartBranchSource): CartSummary {
  const branchContext: CartBranch = {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    city: branch.city,
  };
  if (!cart) {
    return {
      id: null,
      branch: branchContext,
      items: [],
      subtotalMinor: 0,
      discountMinor: 0,
      totalMinor: 0,
      itemCount: 0,
    };
  }

  const items = cart.items.map(toCartItemDto);
  const subtotalMinor = items.reduce((sum, item) => sum + item.lineSubtotalMinor, 0);
  const discountMinor = items.reduce((sum, item) => sum + item.lineDiscountMinor, 0);
  return {
    id: cart.id,
    branch: branchContext,
    items,
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function toCartItemDto(item: CartItemWithProduct): CartItemDto {
  const unitEffectivePriceMinor = item.unitPriceMinor - item.unitDiscountMinor;
  return {
    id: item.id,
    branchProductId: item.branchProduct.id,
    productId: item.branchProduct.product.id,
    productName: item.branchProduct.product.name,
    productSlug: item.branchProduct.product.slug,
    categoryName: item.branchProduct.product.category?.name ?? null,
    imageUrl: resolveCatalogImageUrl({
      branchImages: item.branchProduct.images,
      globalImages: item.branchProduct.product.images,
      categoryImageUrl: item.branchProduct.product.category?.imageUrl ?? null,
    }),
    unitPriceMinor: item.unitPriceMinor,
    unitDiscountMinor: item.unitDiscountMinor,
    unitEffectivePriceMinor,
    quantity: item.quantity,
    lineSubtotalMinor: item.unitPriceMinor * item.quantity,
    lineDiscountMinor: item.unitDiscountMinor * item.quantity,
    lineTotalMinor: unitEffectivePriceMinor * item.quantity,
  };
}

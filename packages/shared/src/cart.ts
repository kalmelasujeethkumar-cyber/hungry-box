export interface CartBranch {
  id: string;
  name: string;
  code: string;
  city: string;
}

export interface CartItemDto {
  id: string;
  branchProductId: string;
  productId: string;
  productName: string;
  productSlug: string;
  categoryName: string | null;
  imageUrl: string | null;
  unitPriceMinor: number;
  unitDiscountMinor: number;
  unitEffectivePriceMinor: number;
  quantity: number;
  lineSubtotalMinor: number;
  lineDiscountMinor: number;
  lineTotalMinor: number;
}

export interface CartSummary {
  id: string | null;
  branch: CartBranch;
  items: CartItemDto[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  itemCount: number;
}

export interface AddCartItemInput {
  branchId: string;
  productId: string;
  quantity: number;
}

export interface UpdateCartItemInput {
  quantity: number;
}

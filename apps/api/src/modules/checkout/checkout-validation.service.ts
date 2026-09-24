import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  BranchProductStatus,
  BranchStatus,
  CatalogStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requireActiveUser } from '../../common/utils/active-user';
import { haversineKm } from '../locations/geo';
import { DefaultDeliveryFeePolicy } from './delivery-fee.policy';

export interface CheckoutBranchSource {
  id: string;
  name: string;
  code: string;
  city: string;
}

export interface ValidatedCheckoutLineItem {
  branchProductId: string;
  productId: string;
  productName: string;
  categoryName: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  unitDiscountMinor: number;
  unitEffectivePriceMinor: number;
  lineSubtotalMinor: number;
  lineDiscountMinor: number;
  lineTotalMinor: number;
}

export interface CheckoutUnavailableItem {
  productId: string;
  productName: string;
  reason: string;
}

export interface CheckoutPriceChange {
  productId: string;
  productName: string;
  fromUnitPriceMinor: number;
  toUnitPriceMinor: number;
  fromUnitDiscountMinor: number;
  toUnitDiscountMinor: number;
}

export interface ValidatedCheckout {
  branchId: string;
  branch: CheckoutBranchSource;
  address: Address;
  serviceable: boolean;
  distanceKm: number | null;
  items: ValidatedCheckoutLineItem[];
  unavailableItems: CheckoutUnavailableItem[];
  priceChanges: CheckoutPriceChange[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  itemCount: number;
}

/**
 * Source of truth for every checkout decision. All prices, availability,
 * serviceability and totals are recomputed here from current branch/product
 * data with every read — clients never supply or vouch for amounts.
 */
@Injectable()
export class CheckoutValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryFeePolicy: DefaultDeliveryFeePolicy,
    private readonly config: ConfigService,
  ) {}

  async resolve(
    customerId: string,
    addressId: string,
    client: Prisma.TransactionClient | PrismaClient = this.prisma.requireClient(),
  ): Promise<ValidatedCheckout> {
    await requireActiveUser(this.prisma.requireClient(), customerId);

    const cart = await client.cart.findFirst({
      where: { customerId },
      select: {
        id: true,
        branchId: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            branchProductId: true,
            quantity: true,
            unitPriceMinor: true,
            unitDiscountMinor: true,
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const branch = await client.branch.findUnique({
      where: { id: cart.branchId },
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        status: true,
        latitude: true,
        longitude: true,
        deliveryRadiusKm: true,
      },
    });
    if (!branch || branch.status !== BranchStatus.ACTIVE) {
      throw new BadRequestException('This branch is not accepting orders right now');
    }

    const address = await client.address.findFirst({
      where: { id: addressId, customerId },
    });
    if (!address) {
      throw new NotFoundException('Delivery address not found');
    }

    const branchLatitude = branch.latitude == null ? null : Number(branch.latitude);
    const branchLongitude = branch.longitude == null ? null : Number(branch.longitude);
    const addressLatitude = address.latitude == null ? null : Number(address.latitude);
    const addressLongitude = address.longitude == null ? null : Number(address.longitude);

    let distanceKm: number | null = null;
    let serviceable = false;
    if (
      branchLatitude !== null &&
      branchLongitude !== null &&
      addressLatitude !== null &&
      addressLongitude !== null
    ) {
      distanceKm = haversineKm(addressLatitude, addressLongitude, branchLatitude, branchLongitude);
      serviceable = distanceKm <= Number(branch.deliveryRadiusKm);
    }

    const branchProductRows = await client.branchProduct.findMany({
      where: {
        id: { in: cart.items.map((item) => item.branchProductId) },
      },
      select: {
        id: true,
        priceMinor: true,
        discountMinor: true,
        isAvailable: true,
        status: true,
        product: {
          select: {
            id: true,
            name: true,
            status: true,
            category: { select: { name: true } },
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { imageUrl: true },
            },
          },
        },
      },
    });
    const branchProductById = new Map(branchProductRows.map((row) => [row.id, row]));

    const items: ValidatedCheckoutLineItem[] = [];
    const unavailableItems: CheckoutUnavailableItem[] = [];
    const priceChanges: CheckoutPriceChange[] = [];
    let itemCount = 0;

    for (const cartItem of cart.items) {
      const branchProduct = branchProductById.get(cartItem.branchProductId);
      const productName = branchProduct?.product.name ?? 'Item';
      const productId = branchProduct?.product.id ?? cartItem.branchProductId;

      let unavailableReason: string | null = null;
      if (!branchProduct) {
        unavailableReason = 'Product is no longer sold at this branch';
      } else if (branchProduct.status !== BranchProductStatus.ACTIVE) {
        unavailableReason = 'Product listing is inactive';
      } else if (branchProduct.product.status !== CatalogStatus.ACTIVE) {
        unavailableReason = 'Product is unavailable';
      } else if (!branchProduct.isAvailable) {
        unavailableReason = 'Out of stock';
      }

      if (unavailableReason) {
        unavailableItems.push({ productId, productName, reason: unavailableReason });
        itemCount += cartItem.quantity;
        continue;
      }

      const unitPriceMinor = branchProduct!.priceMinor;
      const unitDiscountMinor = branchProduct!.discountMinor;
      const unitEffectivePriceMinor = unitPriceMinor - unitDiscountMinor;
      const quantity = cartItem.quantity;
      itemCount += quantity;

      if (
        cartItem.unitPriceMinor !== unitPriceMinor ||
        cartItem.unitDiscountMinor !== unitDiscountMinor
      ) {
        priceChanges.push({
          productId,
          productName,
          fromUnitPriceMinor: cartItem.unitPriceMinor,
          toUnitPriceMinor: unitPriceMinor,
          fromUnitDiscountMinor: cartItem.unitDiscountMinor,
          toUnitDiscountMinor: unitDiscountMinor,
        });
      }

      items.push({
        branchProductId: branchProduct!.id,
        productId,
        productName,
        categoryName: branchProduct!.product.category?.name ?? null,
        imageUrl: branchProduct!.product.images[0]?.imageUrl ?? null,
        quantity,
        unitPriceMinor,
        unitDiscountMinor,
        unitEffectivePriceMinor,
        lineSubtotalMinor: unitPriceMinor * quantity,
        lineDiscountMinor: unitDiscountMinor * quantity,
        lineTotalMinor: unitEffectivePriceMinor * quantity,
      });
    }

    const subtotalMinor = items.reduce((sum, item) => sum + item.lineSubtotalMinor, 0);
    const discountMinor = items.reduce((sum, item) => sum + item.lineDiscountMinor, 0);
    const payableMinor = subtotalMinor - discountMinor;
    const deliveryFeeMinor = this.deliveryFeePolicy.compute({
      branchId: branch.id,
      deliveryRadiusKm: Number(branch.deliveryRadiusKm),
      itemCount,
      totalMinor: payableMinor,
    });
    const taxMinor = Math.max(
      0,
      Math.trunc(Number(this.config.get<number>('CHECKOUT_TAX_MINOR', 0))),
    );
    const totalMinor = payableMinor + deliveryFeeMinor + taxMinor;

    return {
      branchId: branch.id,
      branch: { id: branch.id, name: branch.name, code: branch.code, city: branch.city },
      address,
      serviceable,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
      items,
      unavailableItems,
      priceChanges,
      subtotalMinor,
      discountMinor,
      deliveryFeeMinor,
      taxMinor,
      totalMinor,
      itemCount,
    };
  }
}

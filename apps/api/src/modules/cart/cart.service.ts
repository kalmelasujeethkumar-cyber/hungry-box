import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CartSummary } from '@hungrybox/shared';
import { requireActiveUser } from '../../common/utils/active-user';
import {
  BranchProductStatus,
  BranchStatus,
  CatalogStatus,
  type PrismaClient,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CartWithItems, cartWithItemsSelect, CartBranchSource, toCartSummary } from './cart.mapper';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async get(customerId: string, branchId: string): Promise<CartSummary> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const branch = await this.requireBranch(branchId);
    const cart = await this.loadCart(customerId, branchId);
    return toCartSummary(cart, branch);
  }

  async addItem(customerId: string, dto: AddCartItemDto): Promise<CartSummary> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const branch = await this.requireBranch(dto.branchId);

    const branchProduct = await this.findAddableBranchProduct(dto.branchId, dto.productId);

    const cart = await db.cart.upsert({
      where: { customerId_branchId: { customerId, branchId: dto.branchId } },
      update: {},
      create: { customerId, branchId: dto.branchId },
      select: { id: true },
    });

    await db.cartItem.upsert({
      where: {
        cartId_branchProductId: { cartId: cart.id, branchProductId: branchProduct.id },
      },
      update: {
        quantity: { increment: dto.quantity },
        unitPriceMinor: branchProduct.priceMinor,
        unitDiscountMinor: branchProduct.discountMinor,
      },
      create: {
        cartId: cart.id,
        branchProductId: branchProduct.id,
        quantity: dto.quantity,
        unitPriceMinor: branchProduct.priceMinor,
        unitDiscountMinor: branchProduct.discountMinor,
      },
    });

    const updated = await this.loadCart(customerId, dto.branchId);
    return toCartSummary(updated, branch);
  }

  async updateItem(
    customerId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartSummary> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const item = await this.findOwnedItem(db, customerId, itemId);
    await db.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });
    const branch = await this.requireBranch(item.cart.branchId);
    const updated = await this.loadCart(customerId, item.cart.branchId);
    return toCartSummary(updated, branch);
  }

  async removeItem(customerId: string, itemId: string): Promise<CartSummary> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const item = await this.findOwnedItem(db, customerId, itemId);
    await db.cartItem.delete({ where: { id: itemId } });
    const branch = await this.requireBranch(item.cart.branchId);
    const updated = await this.loadCart(customerId, item.cart.branchId);
    return toCartSummary(updated, branch);
  }

  async clear(customerId: string, branchId: string): Promise<CartSummary> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const branch = await this.requireBranch(branchId);
    const cart = await db.cart.findUnique({
      where: { customerId_branchId: { customerId, branchId } },
      select: { id: true },
    });
    if (cart) {
      await db.cart.delete({ where: { id: cart.id } });
    }
    return toCartSummary(null, branch);
  }

  private async loadCart(customerId: string, branchId: string): Promise<CartWithItems | null> {
    const db = this.prisma.requireClient();
    return db.cart.findUnique({
      where: { customerId_branchId: { customerId, branchId } },
      select: cartWithItemsSelect,
    });
  }

  private async requireBranch(branchId: string): Promise<CartBranchSource> {
    const db = this.prisma.requireClient();
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, code: true, city: true, status: true },
    });
    if (!branch || branch.status !== BranchStatus.ACTIVE) {
      throw new BadRequestException('Branch not found or inactive');
    }
    return {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      city: branch.city,
    };
  }

  private async findAddableBranchProduct(branchId: string, productId: string) {
    const db = this.prisma.requireClient();
    const branchProduct = await db.branchProduct.findFirst({
      where: { branchId, productId },
      select: {
        id: true,
        priceMinor: true,
        discountMinor: true,
        status: true,
        isAvailable: true,
        product: { select: { status: true } },
      },
    });
    if (!branchProduct || branchProduct.status !== BranchProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not available at this branch');
    }
    if (branchProduct.product.status !== CatalogStatus.ACTIVE) {
      throw new BadRequestException('Product is not available at this branch');
    }
    if (!branchProduct.isAvailable) {
      throw new BadRequestException('Product is currently unavailable');
    }
    return branchProduct;
  }

  private async findOwnedItem(
    db: PrismaClient,
    customerId: string,
    itemId: string,
  ): Promise<{ id: string; cart: { branchId: string } }> {
    const item = await db.cartItem.findFirst({
      where: { id: itemId, cart: { customerId } },
      select: { id: true, cart: { select: { branchId: true } } },
    });
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }
    return item;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderDetailDto, OrderStatus, OrderSummaryDto } from '@hungrybox/shared';
import { CheckoutConflictException } from '../../common/exceptions/checkout-conflict.exception';
import { requireActiveUser } from '../../common/utils/active-user';
import type { Address, Prisma, PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { CheckoutValidationService } from '../checkout/checkout-validation.service';
import { toCheckoutPreview } from '../checkout/checkout.mapper';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import { PaymentsService } from '../payments/payments.service';
import type { CancelOrderDto } from './dto/cancel-order.dto';
import type { CreateOrderDto } from './dto/create-order.dto';
import {
  orderDetailSelect,
  toOrderDetail,
  orderSummarySelect,
  toOrderSummary,
} from './order.mapper';
import { OrderNumberService } from './order-number.service';
import { OrderStateService } from './order-state.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutValidation: CheckoutValidationService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly payments: PaymentsService,
    private readonly orderNumbers: OrderNumberService,
    private readonly orderState: OrderStateService,
    private readonly audit: AuditService,
  ) {}

  async myOrders(customerId: string, status?: OrderStatus): Promise<OrderSummaryDto[]> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const rows = await db.order.findMany({
      where: { customerId, ...(status ? { status } : {}) },
      select: orderSummarySelect,
      orderBy: { placedAt: 'desc' },
    });
    return rows.map(toOrderSummary);
  }

  async myOrder(customerId: string, orderId: string): Promise<OrderDetailDto> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    return this.requireOwnedDetail(db, customerId, orderId);
  }

  async create(customerId: string, dto: CreateOrderDto): Promise<OrderDetailDto> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);

    const idempotencyKey = dto.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new BadRequestException('An idempotency key is required to place an order');
    }

    const replay = await db.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (replay) {
      await this.audit.record({
        actorRole: 'CUSTOMER',
        actorId: customerId,
        kind: AuditKinds.IDEMPOTENCY_REPLAY,
        entityType: 'Order',
        entityId: replay.orderId ?? null,
        message: `Duplicate order request (idempotency key ${idempotencyKey})`,
      });
      if (replay.customerId !== customerId || !replay.orderId) {
        throw new BadRequestException('Idempotency key is already in use');
      }
      return this.myOrder(customerId, replay.orderId);
    }

    const verification = await this.payments.requireFinalVerification(dto.paymentId, customerId);
    const provider = await this.paymentProviders.current();

    let created: { id: string; branchId: string };
    try {
      created = await db.$transaction(async (tx) => {
        const validated = await this.checkoutValidation.resolve(customerId, dto.addressId, tx);
        const preview = toCheckoutPreview(validated, provider.supportedMethods);

        if (validated.totalMinor !== verification.payment.amountMinor) {
          throw new CheckoutConflictException(
            'checkout.prices_changed',
            preview,
            'Amount changed since the payment was initiated; review the updated total',
          );
        }
        if (!validated.serviceable) {
          throw new CheckoutConflictException(
            'checkout.unserviceable',
            preview,
            'This address is outside the branch delivery area',
          );
        }
        if (validated.unavailableItems.length > 0) {
          throw new CheckoutConflictException(
            'checkout.unavailable',
            preview,
            'Some items in your cart are no longer available',
          );
        }

        const orderNumber = await this.orderNumbers.next(tx);
        const order = await tx.order.create({
          data: {
            orderNumber,
            customerId,
            branchId: validated.branchId,
            status: 'PLACED',
            paymentStatus: 'PAID',
            subtotalMinor: validated.subtotalMinor,
            discountMinor: validated.discountMinor,
            deliveryFeeMinor: validated.deliveryFeeMinor,
            taxMinor: validated.taxMinor,
            totalMinor: validated.totalMinor,
            notes: dto.notes?.trim() || null,
            items: {
              create: validated.items.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPriceMinor: item.unitPriceMinor,
                unitDiscountMinor: item.unitDiscountMinor,
                lineSubtotalMinor: item.lineSubtotalMinor,
                lineDiscountMinor: item.lineDiscountMinor,
                lineTotalMinor: item.lineTotalMinor,
              })),
            },
            address: {
              create: toAddressSnapshot(validated.address),
            },
            events: {
              create: { kind: 'ORDER_CREATED', toStatus: 'PLACED', actorRole: 'CUSTOMER' },
            },
          },
          select: { id: true },
        });

        await tx.payment.update({
          where: { id: verification.payment.id },
          data: { status: 'PAID', orderId: order.id, paidAt: verification.paidAt },
        });
        await tx.idempotencyKey.create({
          data: { key: idempotencyKey, customerId, orderId: order.id },
        });
        await tx.cart.deleteMany({
          where: { customerId, branchId: validated.branchId },
        });
        return { id: order.id, branchId: validated.branchId };
      });
    } catch (error) {
      const concurrentReplay = await db.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (
        concurrentReplay &&
        concurrentReplay.customerId === customerId &&
        concurrentReplay.orderId
      ) {
        await this.audit.record({
          actorRole: 'CUSTOMER',
          actorId: customerId,
          kind: AuditKinds.IDEMPOTENCY_REPLAY,
          entityType: 'Order',
          entityId: concurrentReplay.orderId,
          message: `Concurrent duplicate order request (idempotency key ${idempotencyKey})`,
        });
        return this.myOrder(customerId, concurrentReplay.orderId);
      }
      throw error;
    }

    await this.audit.record({
      actorRole: 'CUSTOMER',
      actorId: customerId,
      kind: AuditKinds.ORDER_CREATED,
      entityType: 'Order',
      entityId: created.id,
      branchId: created.branchId,
      message: `Order placed (${verification.payment.amountMinor} minor units)`,
    });

    return this.myOrder(customerId, created.id);
  }

  async cancelMine(
    customerId: string,
    orderId: string,
    dto: CancelOrderDto,
  ): Promise<OrderDetailDto> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const order = await db.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, status: true, branchId: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.orderState.assertCustomerCancellable(order.status);
    const reason = dto.reason?.trim() || null;

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByRole: 'CUSTOMER',
          cancellationReason: reason,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          kind: 'ORDER_CANCELLED',
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          actorRole: 'CUSTOMER',
        },
      });
    });

    await this.audit.record({
      actorRole: 'CUSTOMER',
      actorId: customerId,
      kind: AuditKinds.ORDER_CANCELLED,
      entityType: 'Order',
      entityId: order.id,
      branchId: order.branchId,
      message: `Order cancelled by customer${reason ? `: ${reason}` : ''}`,
    });

    return this.myOrder(customerId, order.id);
  }

  private async requireOwnedDetail(
    db: PrismaClient,
    customerId: string,
    orderId: string,
  ): Promise<OrderDetailDto> {
    const order = await db.order.findFirst({
      where: { id: orderId, customerId },
      select: orderDetailSelect,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderDetail(order);
  }
}

function toAddressSnapshot(address: Address): Prisma.OrderAddressCreateWithoutOrderInput {
  return {
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    houseFlat: address.houseFlat,
    streetArea: address.streetArea,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    latitude: address.latitude,
    longitude: address.longitude,
    deliveryInstructions: address.deliveryInstructions,
  };
}

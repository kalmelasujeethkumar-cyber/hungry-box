import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderDetailDto, OrderSummaryDto, UserRole } from '@hungrybox/shared';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import {
  orderDetailSelect,
  orderSummarySelect,
  toOrderDetail,
  toOrderSummary,
} from '../orders/order.mapper';
import { OrderStateService } from '../orders/order-state.service';
import type { BranchOrderListQueryDto } from './dto/branch-order-list-query.dto';
import type { BranchOrderCancelDto } from './dto/branch-order-cancel.dto';
import type { BranchOrderStatusDto } from './dto/branch-order-status.dto';

export interface BranchActor {
  role: UserRole;
  branchId: string | null;
}

@Injectable()
export class BranchOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderState: OrderStateService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: BranchActor, query: BranchOrderListQueryDto): Promise<OrderSummaryDto[]> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const where: Prisma.OrderWhereInput = {};

    if (enforcedBranchId !== null) {
      where.branchId = enforcedBranchId;
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.from) {
      where.placedAt = {
        ...(typeof where.placedAt === 'object' && where.placedAt !== null
          ? (where.placedAt as object)
          : {}),
        gte: new Date(query.from),
      };
    }
    if (query.to) {
      where.placedAt = {
        ...(typeof where.placedAt === 'object' && where.placedAt !== null
          ? (where.placedAt as object)
          : {}),
        lte: new Date(query.to),
      };
    }

    const rows = await db.order.findMany({
      where,
      select: orderSummarySelect,
      orderBy: { placedAt: 'desc' },
    });
    return rows.map(toOrderSummary);
  }

  async get(actor: BranchActor, orderId: string): Promise<OrderDetailDto> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const order = await db.order.findFirst({
      where: { id: orderId, ...(enforcedBranchId !== null ? { branchId: enforcedBranchId } : {}) },
      select: orderDetailSelect,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderDetail(order);
  }

  async advanceStatus(
    actor: BranchActor,
    orderId: string,
    dto: BranchOrderStatusDto,
  ): Promise<OrderDetailDto> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, branchId: true },
    });
    if (!order || (enforcedBranchId !== null && order.branchId !== enforcedBranchId)) {
      throw new NotFoundException('Order not found');
    }

    this.orderState.assertAdvance(order.status, dto.status);
    const timestampField = this.orderState.timestampFieldFor(dto.status);
    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: dto.status };
    if (timestampField) {
      (data as Record<string, unknown>)[timestampField] = now;
    }

    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          kind: 'STATUS_CHANGED',
          fromStatus: order.status,
          toStatus: dto.status,
          actorRole: actor.role,
        },
      });
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: null,
      kind: AuditKinds.ORDER_STATUS_CHANGED,
      entityType: 'Order',
      entityId: order.id,
      message: `Order status changed ${order.status} -> ${dto.status}`,
    });

    return this.get(actor, order.id);
  }

  async cancel(
    actor: BranchActor,
    orderId: string,
    dto: BranchOrderCancelDto,
  ): Promise<OrderDetailDto> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, branchId: true },
    });
    if (!order || (enforcedBranchId !== null && order.branchId !== enforcedBranchId)) {
      throw new NotFoundException('Order not found');
    }

    this.orderState.assertStaffCancellable(order.status);
    const reason = dto.reason?.trim() || null;

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByRole: actor.role,
          cancellationReason: reason,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          kind: 'ORDER_CANCELLED',
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          actorRole: actor.role,
        },
      });
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: null,
      kind: AuditKinds.ORDER_CANCELLED,
      entityType: 'Order',
      entityId: order.id,
      message: `Order cancelled by ${actor.role}${reason ? `: ${reason}` : ''}`,
    });

    return this.get(actor, order.id);
  }

  /** Branch managers are pinned to their own branch; super admins are global. */
  private enforcedBranchId(actor: BranchActor): string | null {
    return actor.role === 'SUPER_ADMIN' ? null : actor.branchId;
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DeliveryAssignmentDto,
  DeliveryAssignmentListItemDto,
  DeliveryAssignmentStatus,
  DeliveryRealtimeEventType,
  OrderStatus,
  UserRole,
} from '@hungrybox/shared';
import { DeliveryAvailability, Prisma } from '../../generated/prisma/client';
import { DeliveryConflictException } from '../../common/exceptions/delivery-conflict.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { OrderStateService } from '../orders/order-state.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryPartnerService } from '../delivery-partners/delivery-partner.service';
import { DeliveryEventsService } from './delivery-events.service';
import { toAssignmentDto, toAssignmentListItemDto } from './delivery-assignment.mapper';
import type { AssignOrderDto } from './dto/assign-order.dto';
import type { BranchAssignmentListQueryDto } from './dto/branch-assignment-list-query.dto';
import type { CancelAssignmentDto } from './dto/cancel-assignment.dto';
import type { RejectAssignmentDto } from './dto/reject-assignment.dto';

export interface DeliveryStaffActor {
  role: UserRole;
  branchId: string | null;
  userId: string;
}

export const ACTIVE_ASSIGNMENT_STATUSES: DeliveryAssignmentStatus[] = [
  'ASSIGNED',
  'ACCEPTED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

const assignmentDetailSelect = {
  id: true,
  status: true,
  assignedAt: true,
  acceptedAt: true,
  rejectedAt: true,
  pickedUpAt: true,
  outForDeliveryAt: true,
  deliveredAt: true,
  cancelledAt: true,
  rejectionReason: true,
  notes: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalMinor: true,
      notes: true,
      branch: { select: { id: true, name: true, code: true, city: true } },
      address: {
        select: {
          recipientName: true,
          phone: true,
          houseFlat: true,
          streetArea: true,
          landmark: true,
          city: true,
          state: true,
          postalCode: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  },
  deliveryPartner: {
    select: {
      id: true,
      partnerId: true,
      fullName: true,
      profilePhotoUrl: true,
      mobile: true,
      vehicleType: true,
      vehicleNumber: true,
    },
  },
} satisfies Prisma.DeliveryAssignmentSelect;

@Injectable()
export class DeliveryAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderState: OrderStateService,
    private readonly audit: AuditService,
    private readonly partners: DeliveryPartnerService,
    private readonly events: DeliveryEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async assign(
    actor: DeliveryStaffActor,
    orderId: string,
    dto: AssignOrderDto,
  ): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, status: true, orderNumber: true, userId: true },
    });
    if (!order || (enforcedBranchId !== null && order.branchId !== enforcedBranchId)) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== 'READY_FOR_PICKUP') {
      throw new DeliveryConflictException(
        'delivery.order_not_ready',
        'Order is not ready for pickup',
      );
    }

    const existing = await db.deliveryAssignment.findFirst({
      where: { orderId: order.id, status: { notIn: ['REJECTED', 'CANCELLED'] } },
      select: { id: true },
    });
    if (existing) {
      throw new DeliveryConflictException(
        'delivery.already_assigned',
        'Order already has an active assignment',
      );
    }

    await this.requireAssignablePartner(dto.deliveryPartnerId, order.branchId);

    try {
      const assignment = await db.$transaction(async (tx) => {
        const created = await tx.deliveryAssignment.create({
          data: {
            orderId: order.id,
            branchId: order.branchId,
            deliveryPartnerId: dto.deliveryPartnerId,
            status: 'ASSIGNED',
            notes: dto.notes ?? null,
          },
        });
        await this.audit.record(
          {
            actorRole: actor.role,
            actorId: actor.userId,
            kind: AuditKinds.DELIVERY_ASSIGNED,
            entityType: 'delivery_assignment',
            entityId: created.id,
            branchId: order.branchId,
            message: `Assigned order ${order.orderNumber} to partner`,
          },
          tx,
        );
        return created;
      });
      await this.announce(assignment.id, 'delivery.assignment.created', 'ASSIGNED', false, true);
      return this.loadDetailOrThrow(assignment.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DeliveryConflictException(
          'delivery.already_assigned',
          'Order already has an active assignment',
        );
      }
      throw error;
    }
  }

  async cancel(
    actor: DeliveryStaffActor,
    orderId: string,
    assignmentId: string,
    dto: CancelAssignmentDto,
  ): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, orderNumber: true },
    });
    if (!order || (enforcedBranchId !== null && order.branchId !== enforcedBranchId)) {
      throw new NotFoundException('Order not found');
    }
    const now = new Date();
    await db.$transaction(async (tx) => {
      const updated = await tx.deliveryAssignment.updateMany({
        where: {
          id: assignmentId,
          orderId: order.id,
          status: { in: ['ASSIGNED', 'ACCEPTED'] },
        },
        data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: dto.reason ?? null },
      });
      if (updated.count === 0) {
        throw new DeliveryConflictException(
          'delivery.already_handled',
          'Assignment is not cancellable',
        );
      }
      await this.releasePartnerIfIdle(tx, assignmentId);
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.DELIVERY_CANCELLED,
          entityType: 'delivery_assignment',
          entityId: assignmentId,
          branchId: order.branchId,
          message: `Cancelled assignment for order ${order.orderNumber}`,
        },
        tx,
      );
    });
    await this.announce(assignmentId, 'delivery.assignment.cancelled', 'CANCELLED', false, true);
    return this.loadDetailOrThrow(assignmentId);
  }

  async list(
    actor: DeliveryStaffActor,
    query: BranchAssignmentListQueryDto,
  ): Promise<DeliveryAssignmentListItemDto[]> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const where: Prisma.DeliveryAssignmentWhereInput = {};
    if (enforcedBranchId !== null) {
      where.branchId = enforcedBranchId;
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.status) {
      where.status = query.status;
    }
    const rows = await db.deliveryAssignment.findMany({
      where,
      orderBy: { assignedAt: 'desc' },
      take: query.limit ?? 50,
      select: assignmentListSelect,
    });
    return rows.map((row) => toAssignmentListItemDto(row));
  }

  async myAssignments(
    userId: string,
    status?: DeliveryAssignmentStatus,
  ): Promise<DeliveryAssignmentListItemDto[]> {
    const db = this.prisma.requireClient();
    const profile = await this.partnerProfileFor(userId);
    const where: Prisma.DeliveryAssignmentWhereInput = { deliveryPartnerId: profile.id };
    if (status) {
      where.status = status;
    }
    const rows = await db.deliveryAssignment.findMany({
      where,
      orderBy: { assignedAt: 'desc' },
      take: 100,
      select: assignmentListSelect,
    });
    return rows.map((row) => toAssignmentListItemDto(row));
  }

  async getOwn(userId: string, assignmentId: string): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const profile = await this.partnerProfileFor(userId);
    const row = await db.deliveryAssignment.findFirst({
      where: { id: assignmentId, deliveryPartnerId: profile.id },
      select: assignmentDetailSelect,
    });
    if (!row) {
      throw new NotFoundException('Assignment not found');
    }
    return toAssignmentDto(row);
  }

  async accept(userId: string, assignmentId: string): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const profile = await this.partnerProfileFor(userId);
    this.requireOperationalPartner(profile);
    const now = new Date();
    await db.$transaction(async (tx) => {
      const updated = await tx.deliveryAssignment.updateMany({
        where: { id: assignmentId, deliveryPartnerId: profile.id, status: 'ASSIGNED' },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (updated.count === 0) {
        throw new DeliveryConflictException(
          'delivery.already_handled',
          'Assignment is no longer pending',
        );
      }
      await tx.deliveryPartnerProfile.update({
        where: { id: profile.id },
        data: { availability: DeliveryAvailability.ON_DELIVERY },
      });
      await this.audit.record(
        {
          actorRole: 'DELIVERY_PARTNER',
          actorId: userId,
          kind: AuditKinds.DELIVERY_ACCEPTED,
          entityType: 'delivery_assignment',
          entityId: assignmentId,
          branchId: profile.branchId,
          message: 'Assignment accepted',
        },
        tx,
      );
    });
    await this.announce(assignmentId, 'delivery.assignment.accepted', 'ACCEPTED', false, false);
    return this.loadDetailOrThrow(assignmentId);
  }

  async reject(
    userId: string,
    assignmentId: string,
    dto: RejectAssignmentDto,
  ): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const profile = await this.partnerProfileFor(userId);
    this.requireOperationalPartner(profile);
    const reason = dto.reason?.trim() || null;
    await db.$transaction(async (tx) => {
      const updated = await tx.deliveryAssignment.updateMany({
        where: { id: assignmentId, deliveryPartnerId: profile.id, status: 'ASSIGNED' },
        data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
      });
      if (updated.count === 0) {
        throw new DeliveryConflictException(
          'delivery.already_handled',
          'Assignment is no longer pending',
        );
      }
      await this.audit.record(
        {
          actorRole: 'DELIVERY_PARTNER',
          actorId: userId,
          kind: AuditKinds.DELIVERY_REJECTED,
          entityType: 'delivery_assignment',
          entityId: assignmentId,
          branchId: profile.branchId,
          message: reason ? `Assignment rejected: ${reason}` : 'Assignment rejected',
        },
        tx,
      );
    });
    await this.announce(assignmentId, 'delivery.assignment.rejected', 'REJECTED', false, false);
    return this.loadDetailOrThrow(assignmentId);
  }

  async pickup(userId: string, assignmentId: string): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const profile = await this.partnerProfileFor(userId);
    this.requireOperationalPartner(profile);
    const now = new Date();
    await db.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.findFirst({
        where: { id: assignmentId, deliveryPartnerId: profile.id },
        select: { id: true, status: true, orderId: true },
      });
      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }
      if (assignment.status !== 'ACCEPTED') {
        throw new DeliveryConflictException(
          'delivery.wrong_state',
          'Assignment must be accepted before pickup',
        );
      }
      const orderRow = await tx.order.findUnique({
        where: { id: assignment.orderId },
        select: { id: true, status: true },
      });
      if (!orderRow) {
        throw new NotFoundException('Order not found');
      }
      await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { status: 'PICKED_UP', pickedUpAt: now },
      });
      await this.advanceOrder(
        tx,
        orderRow.id,
        orderRow.status,
        'OUT_FOR_DELIVERY',
        'DELIVERY_PARTNER',
      );
      await this.audit.record(
        {
          actorRole: 'DELIVERY_PARTNER',
          actorId: userId,
          kind: AuditKinds.DELIVERY_PICKED_UP,
          entityType: 'delivery_assignment',
          entityId: assignment.id,
          branchId: profile.branchId,
          message: 'Order picked up',
        },
        tx,
      );
    });
    await this.announce(assignmentId, 'delivery.picked_up', 'PICKED_UP', true, false);
    return this.loadDetailOrThrow(assignmentId);
  }

  async outForDelivery(userId: string, assignmentId: string): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const profile = await this.partnerProfileFor(userId);
    this.requireOperationalPartner(profile);
    const now = new Date();
    await db.$transaction(async (tx) => {
      const result = await tx.deliveryAssignment.updateMany({
        where: { id: assignmentId, deliveryPartnerId: profile.id, status: 'PICKED_UP' },
        data: { status: 'OUT_FOR_DELIVERY', outForDeliveryAt: now },
      });
      if (result.count === 0) {
        throw new DeliveryConflictException(
          'delivery.wrong_state',
          'Assignment must be picked up first',
        );
      }
      await this.audit.record(
        {
          actorRole: 'DELIVERY_PARTNER',
          actorId: userId,
          kind: AuditKinds.DELIVERY_OUT_FOR_DELIVERY,
          entityType: 'delivery_assignment',
          entityId: assignmentId,
          branchId: profile.branchId,
          message: 'Out for delivery',
        },
        tx,
      );
    });
    await this.announce(assignmentId, 'delivery.out_for_delivery', 'OUT_FOR_DELIVERY', true, false);
    return this.loadDetailOrThrow(assignmentId);
  }

  async deliver(userId: string, assignmentId: string): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const profile = await this.partnerProfileFor(userId);
    this.requireOperationalPartner(profile);
    const now = new Date();
    await db.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.findFirst({
        where: { id: assignmentId, deliveryPartnerId: profile.id },
        select: { id: true, status: true, orderId: true },
      });
      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }
      if (assignment.status !== 'OUT_FOR_DELIVERY') {
        throw new DeliveryConflictException(
          'delivery.wrong_state',
          'Assignment must be out for delivery first',
        );
      }
      const orderRow = await tx.order.findUnique({
        where: { id: assignment.orderId },
        select: { id: true, status: true },
      });
      if (!orderRow) {
        throw new NotFoundException('Order not found');
      }
      await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { status: 'DELIVERED', deliveredAt: now },
      });
      await this.advanceOrder(tx, orderRow.id, orderRow.status, 'DELIVERED', 'DELIVERY_PARTNER');
      await tx.deliveryPartnerProfile.update({
        where: { id: profile.id },
        data: { availability: DeliveryAvailability.ONLINE },
      });
      await this.audit.record(
        {
          actorRole: 'DELIVERY_PARTNER',
          actorId: userId,
          kind: AuditKinds.DELIVERY_COMPLETED,
          entityType: 'delivery_assignment',
          entityId: assignment.id,
          branchId: profile.branchId,
          message: 'Order delivered',
        },
        tx,
      );
    });
    await this.announce(assignmentId, 'delivery.delivered', 'DELIVERED', true, false);
    return this.loadDetailOrThrow(assignmentId);
  }

  private async requireAssignablePartner(partnerId: string, branchId: string): Promise<void> {
    const db = this.prisma.requireClient();
    const partner = await db.deliveryPartnerProfile.findUnique({
      where: { id: partnerId },
      select: { id: true, branchId: true, status: true, availability: true },
    });
    if (!partner || partner.branchId !== branchId) {
      throw new DeliveryConflictException(
        'delivery.partner_ineligible',
        'Partner is not attached to this branch',
      );
    }
    if (partner.status !== 'ACTIVE') {
      throw new DeliveryConflictException('delivery.partner_ineligible', 'Partner is not active');
    }
    if (partner.availability === 'OFFLINE') {
      throw new DeliveryConflictException('delivery.partner_offline', 'Partner is offline');
    }
    if (await this.partners.hasActiveDelivery(partner.id)) {
      throw new DeliveryConflictException(
        'delivery.partner_busy',
        'Partner has an active delivery',
      );
    }
  }

  private async advanceOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    fromStatus: OrderStatus,
    to: 'OUT_FOR_DELIVERY' | 'DELIVERED',
    actorRole: string,
  ): Promise<void> {
    this.orderState.assertAdvance(fromStatus, to);
    const now = new Date();
    const timestampField = this.orderState.timestampFieldFor(to);
    const data: Prisma.OrderUpdateInput = { status: to };
    if (timestampField) {
      (data as Record<string, unknown>)[timestampField] = now;
    }
    await tx.order.update({ where: { id: orderId }, data });
    await tx.orderEvent.create({
      data: {
        orderId,
        kind: 'STATUS_CHANGED',
        fromStatus,
        toStatus: to,
        actorRole,
      },
    });
  }

  private async releasePartnerIfIdle(
    tx: Prisma.TransactionClient,
    assignmentId: string,
  ): Promise<void> {
    const assignment = await tx.deliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        deliveryPartnerId: true,
        branchId: true,
        order: { select: { branchId: true } },
      },
    });
    if (!assignment) return;
    const otherActive = await tx.deliveryAssignment.findFirst({
      where: {
        deliveryPartnerId: assignment.deliveryPartnerId,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        id: { not: assignmentId },
      },
      select: { id: true },
    });
    if (!otherActive) {
      await tx.deliveryPartnerProfile.update({
        where: { id: assignment.deliveryPartnerId },
        data: { availability: DeliveryAvailability.ONLINE },
      });
    }
  }

  private async announce(
    assignmentId: string,
    type: DeliveryRealtimeEventType,
    status: DeliveryAssignmentStatus,
    notifyCustomer: boolean,
    notifyPartner: boolean,
  ): Promise<void> {
    const db = this.prisma.requireClient();
    const row = await db.deliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        branchId: true,
        orderId: true,
        order: { select: { orderNumber: true, userId: true } },
        deliveryPartner: { select: { userId: true } },
      },
    });
    if (!row || !row.order || !row.deliveryPartner) return;
    const userIds: string[] = [];
    if (notifyPartner) userIds.push(row.deliveryPartner.userId);
    if (notifyCustomer) userIds.push(row.order.userId);
    this.events.announce(
      row.branchId,
      type,
      status,
      row.id,
      row.orderId,
      row.order.orderNumber,
      userIds,
    );
    const title = notificationTitle(type, row.order.orderNumber);
    if (notifyPartner) {
      await this.notifications.notify(
        row.deliveryPartner.userId,
        type,
        title,
        `Order ${row.order.orderNumber}`,
      );
    }
    if (notifyCustomer) {
      await this.notifications.notify(row.order.userId, type, title);
    }
  }

  private async loadDetailOrThrow(assignmentId: string): Promise<DeliveryAssignmentDto> {
    const db = this.prisma.requireClient();
    const row = await db.deliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: assignmentDetailSelect,
    });
    if (!row) {
      throw new NotFoundException('Assignment not found');
    }
    return toAssignmentDto(row);
  }

  private async partnerProfileFor(userId: string): Promise<{
    id: string;
    branchId: string;
    status: string;
  }> {
    const db = this.prisma.requireClient();
    const profile = await db.deliveryPartnerProfile.findUnique({
      where: { userId },
      select: { id: true, branchId: true, status: true },
    });
    if (!profile) {
      throw new NotFoundException('Delivery partner profile not found');
    }
    return profile;
  }

  private requireOperationalPartner(profile: { status: string }): void {
    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }
  }

  private enforcedBranchId(actor: DeliveryStaffActor): string | null {
    if (actor.role === 'BRANCH_MANAGER') {
      if (!actor.branchId) {
        throw new ConflictException('Branch manager has no assigned branch');
      }
      return actor.branchId;
    }
    return null;
  }
}

const assignmentListSelect = {
  id: true,
  status: true,
  assignedAt: true,
  acceptedAt: true,
  deliveredAt: true,
  order: {
    select: {
      orderNumber: true,
      totalMinor: true,
      branch: { select: { city: true } },
      address: { select: { recipientName: true, city: true } },
    },
  },
} satisfies Prisma.DeliveryAssignmentSelect;

function notificationTitle(type: DeliveryRealtimeEventType, orderNumber: string): string {
  switch (type) {
    case 'delivery.assignment.created':
      return `New delivery assignment (${orderNumber})`;
    case 'delivery.assignment.accepted':
      return `Delivery confirmed (${orderNumber})`;
    case 'delivery.assignment.rejected':
      return `Assignment rejected (${orderNumber})`;
    case 'delivery.assignment.cancelled':
      return `Assignment cancelled (${orderNumber})`;
    case 'delivery.picked_up':
      return `Your order is picked up (${orderNumber})`;
    case 'delivery.out_for_delivery':
      return `Your order is out for delivery (${orderNumber})`;
    case 'delivery.delivered':
      return `Your order is delivered (${orderNumber})`;
    case 'delivery.location.updated':
      return `Delivery location updated (${orderNumber})`;
    default:
      return `Delivery update (${orderNumber})`;
  }
}

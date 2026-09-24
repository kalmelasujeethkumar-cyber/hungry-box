import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DeliveryAssignmentStatus,
  DeliveryPartnerProfileDto,
  DeliveryRealtimeEvent,
} from '@hungrybox/shared';
import type { Prisma } from '../../generated/prisma/client';
import { DeliveryAvailability } from '../../generated/prisma/enums';
import { DeliveryConflictException } from '../../common/exceptions/delivery-conflict.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { toPartnerProfileDto } from './delivery-partner.mapper';
import { DeliveryPartnerService } from './delivery-partner.service';
import type { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

const ACTIVE_ASSIGNMENT_STATUSES: DeliveryAssignmentStatus[] = [
  'ASSIGNED',
  'ACCEPTED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];
const MAX_LOCATION_RECORDS_PER_PARTNER = 500;

@Injectable()
export class DeliveryMeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partners: DeliveryPartnerService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async getProfile(userId: string): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await db.deliveryPartnerProfile.findUnique({
      where: { userId },
      include: {
        branch: { select: { id: true, name: true, code: true, city: true } },
        documents: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Delivery partner profile not found');
    }
    const counts = await this.partners.activeDeliveryCounts([profile.id]);
    return toPartnerProfileDto(profile, profile.documents, counts.get(profile.id) ?? 0);
  }

  async setAvailability(
    userId: string,
    availability: 'ONLINE' | 'OFFLINE',
  ): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await db.deliveryPartnerProfile.findUnique({
      where: { userId },
      select: { id: true, status: true, availability: true },
    });
    if (!profile) {
      throw new NotFoundException('Delivery partner profile not found');
    }

    const now = new Date();
    const updated = await db.$transaction(async (tx) => {
      if (availability === 'ONLINE') {
        if (profile.status !== 'ACTIVE') {
          throw new DeliveryConflictException(
            'delivery.partner_ineligible',
            'Only active partners can go online',
          );
        }
        const updatedRow = await tx.deliveryPartnerProfile.updateMany({
          where: {
            id: profile.id,
            status: 'ACTIVE',
            availability: {
              in: [DeliveryAvailability.OFFLINE, DeliveryAvailability.ONLINE],
            },
          },
          data: {
            availability: DeliveryAvailability.ONLINE,
            wentOnlineAt: now,
          },
        });
        if (updatedRow.count === 0) {
          throw new DeliveryConflictException(
            'delivery.partner_offline',
            'Partner availability changed concurrently; retry online',
          );
        }
      } else {
        const active = await tx.deliveryAssignment.findFirst({
          where: {
            deliveryPartnerId: profile.id,
            status: { in: ACTIVE_ASSIGNMENT_STATUSES },
          },
          select: { id: true },
        });
        if (active) {
          throw new DeliveryConflictException(
            'delivery.active_delivery_pending',
            'Partner has an active delivery',
          );
        }
        await tx.deliveryPartnerProfile.update({
          where: { id: profile.id },
          data: { availability: DeliveryAvailability.OFFLINE, wentOfflineAt: now },
        });
      }
      return tx.deliveryPartnerProfile.findFirstOrThrow({
        where: { id: profile.id },
        include: {
          branch: { select: { id: true, name: true, code: true, city: true } },
          documents: true,
        },
      });
    });
    return toPartnerProfileDto(
      updated,
      updated.documents,
      (await this.partners.activeDeliveryCounts([updated.id])).get(updated.id) ?? 0,
    );
  }

  async updateLocation(
    userId: string,
    dto: UpdateDeliveryLocationDto,
  ): Promise<{ recordedAt: string }> {
    const db = this.prisma.requireClient();
    const profile = await db.deliveryPartnerProfile.findUnique({
      where: { userId },
      select: { id: true, status: true, availability: true },
    });
    if (!profile) {
      throw new NotFoundException('Delivery partner profile not found');
    }
    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }
    if (profile.availability === 'OFFLINE') {
      throw new DeliveryConflictException(
        'delivery.location_offline',
        'Location updates are only recorded while online',
      );
    }

    const timestamp = new Date();
    const assignment = await db.deliveryAssignment.findFirst({
      where: {
        deliveryPartnerId: profile.id,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      },
      orderBy: { assignedAt: 'desc' },
      select: {
        id: true,
        branchId: true,
        status: true,
        order: { select: { id: true, orderNumber: true, customerId: true } },
      },
    });

    await db.$transaction(async (tx) => {
      await tx.deliveryPartnerLocation.create({
        data: {
          deliveryPartnerId: profile.id,
          assignmentId: assignment?.id ?? null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy ?? null,
          heading: dto.heading ?? null,
          speed: dto.speed ?? null,
          recordedAt: timestamp,
        },
      });
      await tx.deliveryPartnerProfile.update({
        where: { id: profile.id },
        data: { latitude: dto.latitude, longitude: dto.longitude },
      });
      await this.pruneLocationHistory(tx, profile.id);
    });

    if (assignment?.order) {
      const event: DeliveryRealtimeEvent = {
        type: 'delivery.location.updated',
        assignmentId: assignment.id,
        orderId: assignment.order.id,
        orderNumber: assignment.order.orderNumber,
        status: assignment.status,
        at: timestamp.toISOString(),
      };
      this.realtime.emitToUser(assignment.order.customerId, 'delivery.location.updated', event);
      this.realtime.emitToBranch(assignment.branchId, 'delivery.location.updated', event);
    }

    return { recordedAt: timestamp.toISOString() };
  }

  private async pruneLocationHistory(
    tx: Prisma.TransactionClient,
    partnerId: string,
  ): Promise<void> {
    const count = await tx.deliveryPartnerLocation.count({
      where: { deliveryPartnerId: partnerId },
    });
    if (count <= MAX_LOCATION_RECORDS_PER_PARTNER) return;
    const oldest = await tx.deliveryPartnerLocation.findMany({
      where: { deliveryPartnerId: partnerId },
      orderBy: { recordedAt: 'asc' },
      select: { id: true },
      take: count - MAX_LOCATION_RECORDS_PER_PARTNER,
    });
    await tx.deliveryPartnerLocation.deleteMany({
      where: { id: { in: oldest.map((row) => row.id) } },
    });
  }
}

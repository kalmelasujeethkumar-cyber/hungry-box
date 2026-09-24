import { Injectable, NotFoundException } from '@nestjs/common';
import type { DeliveryTrackingDto } from '@hungrybox/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineKm } from '../locations/geo';

export interface DeliveryTrackingSource {
  orderId: string;
  orderNumber: string;
  status: string;
  address: {
    latitude: { toString(): string } | number | null;
    longitude: { toString(): string } | number | null;
  } | null;
  assignment: {
    id: string;
    status: NonNullable<DeliveryTrackingDto['assignment']>['status'];
    assignedAt: Date;
    acceptedAt: Date | null;
    pickedUpAt: Date | null;
    outForDeliveryAt: Date | null;
    deliveredAt: Date | null;
    deliveryPartner: {
      id: string;
      partnerId: string;
      fullName: string;
      profilePhotoUrl: string | null;
      mobile: string | null;
      vehicleType: string | null;
      vehicleNumber: string | null;
      locations: Array<{
        latitude: { toString(): string } | number;
        longitude: { toString(): string } | number;
        accuracy: { toString(): string } | number | null;
        recordedAt: Date;
      }>;
    } | null;
  } | null;
}

@Injectable()
export class DeliveryTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Customer-visible tracking for their own order. */
  async getTracking(customerUserId: string, orderId: string): Promise<DeliveryTrackingDto> {
    const db = this.prisma.requireClient();
    const row = await db.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        userId: true,
        address: { select: { latitude: true, longitude: true } },
        deliveryAssignments: {
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            assignedAt: true,
            acceptedAt: true,
            pickedUpAt: true,
            outForDeliveryAt: true,
            deliveredAt: true,
            deliveryPartner: {
              select: {
                id: true,
                partnerId: true,
                fullName: true,
                profilePhotoUrl: true,
                mobile: true,
                vehicleType: true,
                vehicleNumber: true,
                locations: {
                  orderBy: { recordedAt: 'desc' },
                  take: 1,
                  select: {
                    latitude: true,
                    longitude: true,
                    accuracy: true,
                    recordedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!row || row.userId !== customerUserId) {
      throw new NotFoundException('Order not found');
    }

    if (!row.deliveryAssignments.length) {
      return emptyTracking(row.id, row.orderNumber, row.status, null);
    }

    const assignment = row.deliveryAssignments[0];
    const assignStatus = assignment.status;
    const location = assignment.deliveryPartner?.locations[0] ?? null;
    const moving = assignStatus === 'PICKED_UP' || assignStatus === 'OUT_FOR_DELIVERY';
    const address = row.address;

    let distanceToDestinationKm: number | null = null;
    if (moving && location && address?.latitude != null && address.longitude != null) {
      const partnerLat = toNumber(location.latitude);
      const partnerLon = toNumber(location.longitude);
      const addressLat = toNumber(address.latitude);
      const addressLon = toNumber(address.longitude);
      if (
        partnerLat != null &&
        partnerLon != null &&
        addressLat != null &&
        addressLon != null
      ) {
        distanceToDestinationKm = Number(haversineKm(partnerLat, partnerLon, addressLat, addressLon).toFixed(1));
      }
    }

    return {
      orderId: row.id,
      orderNumber: row.orderNumber,
      orderStatus: row.status as DeliveryTrackingDto['orderStatus'],
      assignment: {
        id: assignment.id,
        status: assignStatus,
        assignedAt: assignment.assignedAt.toISOString(),
        acceptedAt: assignment.acceptedAt?.toISOString() ?? null,
        pickedUpAt: assignment.pickedUpAt?.toISOString() ?? null,
        outForDeliveryAt: assignment.outForDeliveryAt?.toISOString() ?? null,
        deliveredAt: assignment.deliveredAt?.toISOString() ?? null,
      },
      partner: assignment.deliveryPartner
        ? {
            fullName: assignment.deliveryPartner.fullName,
            profilePhotoUrl: assignment.deliveryPartner.profilePhotoUrl,
            vehicleType: assignment.deliveryPartner.vehicleType,
            vehicleNumber: assignment.deliveryPartner.vehicleNumber,
            mobile: assignment.deliveryPartner.mobile,
          }
        : null,
      location:
        moving && location
          ? {
              latitude: toNumber(location.latitude) ?? 0,
              longitude: toNumber(location.longitude) ?? 0,
              accuracy: toNumber(location.accuracy),
              recordedAt: location.recordedAt.toISOString(),
            }
          : null,
      distanceToDestinationKm,
      trackingAvailable: moving && location !== null,
    };
  }
}

function emptyTracking(
  orderId: string,
  orderNumber: string,
  status: string,
  location: null,
): DeliveryTrackingDto {
  return {
    orderId,
    orderNumber,
    orderStatus: status as DeliveryTrackingDto['orderStatus'],
    assignment: null,
    partner: null,
    location,
    distanceToDestinationKm: null,
    trackingAvailable: false,
  };
}

function toNumber(value: { toString(): string } | number | null): number | null {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(String(value));
}
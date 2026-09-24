import type {
  DeliveryAssignmentDto,
  DeliveryAssignmentListItemDto,
  DeliveryAssignmentStatus,
} from '@hungrybox/shared';

export interface AssignmentOrderSource {
  id: string;
  orderNumber: string;
  status: string;
  totalMinor: number;
  notes: string | null;
  branch: { id: string; name: string; code: string; city: string };
  address: {
    recipientName: string;
    phone: string | null;
    houseFlat: string;
    streetArea: string;
    landmark: string | null;
    city: string;
    state: string;
    postalCode: string;
    latitude: { toString(): string } | number | null;
    longitude: { toString(): string } | number | null;
  } | null;
}

export interface AssignmentPartnerSource {
  id: string;
  partnerId: string;
  fullName: string;
  profilePhotoUrl: string | null;
  mobile: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
}

export interface AssignmentSource {
  id: string;
  status: DeliveryAssignmentStatus;
  assignedAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  pickedUpAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  rejectionReason: string | null;
  notes: string | null;
  order: AssignmentOrderSource;
  deliveryPartner: AssignmentPartnerSource | null;
}

export function toAssignmentDto(source: AssignmentSource): DeliveryAssignmentDto {
  return {
    id: source.id,
    status: source.status,
    order: {
      id: source.order.id,
      orderNumber: source.order.orderNumber,
      status: source.order.status as DeliveryAssignmentDto['order']['status'],
      totalMinor: source.order.totalMinor,
      notes: source.order.notes,
      branch: source.order.branch,
      address: source.order.address
        ? {
            houseFlat: source.order.address.houseFlat,
            streetArea: source.order.address.streetArea,
            landmark: source.order.address.landmark,
            city: source.order.address.city,
            state: source.order.address.state,
            postalCode: source.order.address.postalCode,
          }
        : null,
    },
    deliveryPartner: source.deliveryPartner
      ? {
          id: source.deliveryPartner.id,
          partnerId: source.deliveryPartner.partnerId,
          fullName: source.deliveryPartner.fullName,
          profilePhotoUrl: source.deliveryPartner.profilePhotoUrl,
          mobile: source.deliveryPartner.mobile,
          vehicleType: source.deliveryPartner.vehicleType,
          vehicleNumber: source.deliveryPartner.vehicleNumber,
        }
      : null,
    assignedAt: source.assignedAt.toISOString(),
    acceptedAt: source.acceptedAt?.toISOString() ?? null,
    rejectedAt: source.rejectedAt?.toISOString() ?? null,
    pickedUpAt: source.pickedUpAt?.toISOString() ?? null,
    outForDeliveryAt: source.outForDeliveryAt?.toISOString() ?? null,
    deliveredAt: source.deliveredAt?.toISOString() ?? null,
    cancelledAt: source.cancelledAt?.toISOString() ?? null,
    rejectionReason: source.rejectionReason,
    notes: source.notes,
  };
}

export interface AssignmentListItemSource {
  id: string;
  status: DeliveryAssignmentStatus;
  assignedAt: Date;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  order: {
    orderNumber: string;
    totalMinor: number;
    branch: { city: string };
    address: { recipientName: string; city: string } | null;
  };
}

export function toAssignmentListItemDto(source: AssignmentListItemSource): DeliveryAssignmentListItemDto {
  return {
    id: source.id,
    status: source.status,
    orderNumber: source.order.orderNumber,
    branchCity: source.order.branch.city,
    recipientName: source.order.address?.recipientName ?? null,
    addressCity: source.order.address?.city ?? null,
    totalMinor: source.order.totalMinor,
    assignedAt: source.assignedAt.toISOString(),
    acceptedAt: source.acceptedAt?.toISOString() ?? null,
    deliveredAt: source.deliveredAt?.toISOString() ?? null,
  };
}
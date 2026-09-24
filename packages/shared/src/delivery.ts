import type { OrderStatus } from './orders';

export const DELIVERY_PARTNER_STATUSES = [
  'PENDING_VERIFICATION',
  'DOCUMENT_REVIEW',
  'VERIFIED',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'REJECTED',
] as const;
export type DeliveryPartnerStatus = (typeof DELIVERY_PARTNER_STATUSES)[number];

export const DELIVERY_AVAILABILITY = ['OFFLINE', 'ONLINE', 'ON_DELIVERY'] as const;
export type DeliveryAvailability = (typeof DELIVERY_AVAILABILITY)[number];

export const DELIVERY_PARTNER_TYPES = ['FULL_TIME', 'PART_TIME', 'GIG'] as const;
export type DeliveryPartnerType = (typeof DELIVERY_PARTNER_TYPES)[number];

export const DELIVERY_ASSIGNMENT_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
] as const;
export type DeliveryAssignmentStatus = (typeof DELIVERY_ASSIGNMENT_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'AADHAAR',
  'PAN',
  'ADDRESS_PROOF',
  'DRIVING_LICENSE',
  'RC',
  'INSURANCE',
  'BANK_PROOF',
  'PROFILE_PHOTO',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ['PENDING', 'UPLOADED', 'VERIFIED', 'REJECTED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface DeliveryBranchDto {
  id: string;
  name: string;
  code: string;
  city: string;
}

export interface DeliveryPartnerDocumentDto {
  id: string;
  type: DocumentType;
  documentReference: string | null;
  status: DocumentStatus;
  verificationNote: string | null;
  verifiedAt: string | null;
}

export interface DeliveryPartnerProfileDto {
  id: string;
  partnerId: string;
  userId: string;
  branch: DeliveryBranchDto;
  fullName: string;
  mobile: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  profilePhotoUrl: string | null;
  houseFlat: string | null;
  streetArea: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  identityVerified: boolean;
  addressProofVerified: boolean;
  drivingLicenceNumber: string | null;
  licenceType: string | null;
  licenceExpiry: string | null;
  licenceVerified: boolean;
  vehicleType: string | null;
  vehicleNumber: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColour: string | null;
  registrationYear: number | null;
  rcReference: string | null;
  insuranceReference: string | null;
  insuranceExpiry: string | null;
  ownVehicle: boolean | null;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  ifsc: string | null;
  payoutVerified: boolean;
  partnerType: DeliveryPartnerType | null;
  joinedAt: string | null;
  status: DeliveryPartnerStatus;
  availability: DeliveryAvailability;
  wentOnlineAt: string | null;
  activeDeliveryCount: number;
  documents: DeliveryPartnerDocumentDto[];
}

/** Partner row for manager/super-admin lists. Does not expose KYC or bank details. */
export interface DeliveryPartnerListItemDto {
  id: string;
  partnerId: string;
  fullName: string;
  mobile: string | null;
  branch: DeliveryBranchDto;
  status: DeliveryPartnerStatus;
  availability: DeliveryAvailability;
  activeDeliveryCount: number;
  distanceKm: number | null;
  joinedAt: string | null;
}

/** Eligible candidate shown to a manager when assigning an order. */
export interface DeliveryPartnerCandidateDto {
  id: string;
  partnerId: string;
  fullName: string;
  status: DeliveryPartnerStatus;
  availability: DeliveryAvailability;
  online: boolean;
  activeDeliveryCount: number;
  distanceKm: number | null;
}

export interface CreateDeliveryPartnerInput {
  fullName: string;
  loginId: string;
  email?: string;
  mobile?: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  /** Required from SUPER_ADMIN; ignored for BRANCH_MANAGER (pinned to own branch). */
  branchId?: string;
  houseFlat?: string;
  streetArea?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColour?: string;
  ownVehicle?: boolean;
  partnerType?: DeliveryPartnerType;
}

export interface CreateDeliveryPartnerResultDto {
  profile: DeliveryPartnerProfileDto;
  /** One-time developer provisioning credential; not stored or returned again. */
  temporaryPassword: string;
}

export interface UpdateDeliveryPartnerInput {
  fullName?: string;
  mobile?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  houseFlat?: string;
  streetArea?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColour?: string;
  registrationYear?: number;
  insuranceExpiry?: string;
  ownVehicle?: boolean;
  partnerType?: DeliveryPartnerType;
}

export const PARTNER_STATUS_ACTIONS = ['BEGIN_REVIEW', 'APPROVE', 'ACTIVATE', 'REJECT'] as const;
export type PartnerStatusAction = (typeof PARTNER_STATUS_ACTIONS)[number];

export interface VerifyDeliveryPartnerInput {
  action: PartnerStatusAction;
  rejectionReason?: string;
}

export type ActivePartnerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface SetDeliveryPartnerStatusInput {
  status: ActivePartnerStatus;
}

export interface UpsertPartnerDocumentInput {
  type: DocumentType;
  documentReference?: string;
}

export interface ReviewPartnerDocumentInput {
  action: 'APPROVE' | 'REJECT';
  note?: string;
}

export interface SetupAvailabilityInput {
  availability: 'ONLINE' | 'OFFLINE';
}

export interface UpdateDeliveryLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}

export interface DeliveryOrderSnapshotDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalMinor: number;
  notes: string | null;
  branch: DeliveryBranchDto;
  address: {
    houseFlat: string;
    streetArea: string;
    landmark: string | null;
    city: string;
    state: string;
    postalCode: string;
  } | null;
}

export interface DeliveryAssignmentDto {
  id: string;
  status: DeliveryAssignmentStatus;
  order: DeliveryOrderSnapshotDto;
  deliveryPartner: {
    id: string;
    partnerId: string;
    fullName: string;
    profilePhotoUrl: string | null;
    mobile: string | null;
    vehicleType: string | null;
    vehicleNumber: string | null;
  } | null;
  assignedAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
}

export interface DeliveryAssignmentListItemDto {
  id: string;
  status: DeliveryAssignmentStatus;
  orderNumber: string;
  branchCity: string;
  recipientName: string | null;
  addressCity: string | null;
  totalMinor: number;
  assignedAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
}

export interface AssignOrderInput {
  deliveryPartnerId: string;
  notes?: string;
}

export interface CancelAssignmentInput {
  reason?: string;
}

export interface RejectAssignmentInput {
  reason?: string;
}

export interface DeliveryTrackingDto {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  assignment: {
    id: string;
    status: DeliveryAssignmentStatus;
    assignedAt: string;
    acceptedAt: string | null;
    pickedUpAt: string | null;
    outForDeliveryAt: string | null;
    deliveredAt: string | null;
  } | null;
  partner: {
    fullName: string;
    profilePhotoUrl: string | null;
    vehicleType: string | null;
    vehicleNumber: string | null;
    mobile: string | null;
  } | null;
  /** Latest shared position while the order is picked up / out for delivery. */
  location: { latitude: number; longitude: number; accuracy: number | null; recordedAt: string } | null;
  /** Straight-line distance from the current shared location to the delivery address. */
  distanceToDestinationKm: number | null;
  trackingAvailable: boolean;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export type DeliveryRealtimeEventType =
  | 'delivery.assignment.created'
  | 'delivery.assignment.accepted'
  | 'delivery.assignment.rejected'
  | 'delivery.assignment.cancelled'
  | 'delivery.picked_up'
  | 'delivery.out_for_delivery'
  | 'delivery.location.updated'
  | 'delivery.delivered';

export interface DeliveryRealtimeEvent {
  type: DeliveryRealtimeEventType;
  assignmentId: string;
  orderId: string;
  orderNumber: string;
  status: DeliveryAssignmentStatus;
  at: string;
}
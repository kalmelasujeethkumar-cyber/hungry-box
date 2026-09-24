import type {
  DeliveryAssignmentStatus,
  DeliveryAvailability,
  DeliveryPartnerStatus,
  DeliveryPartnerType,
  DocumentStatus,
  DocumentType,
} from '@hungrybox/shared';

export const ASSIGNMENT_ACTIVE_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
] as const;

export const ASSIGNMENT_STATUS_LABELS: Record<DeliveryAssignmentStatus, string> = {
  ASSIGNED: 'New delivery assigned',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked up',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const AVAILABILITY_LABELS: Record<DeliveryAvailability, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  ON_DELIVERY: 'On delivery',
};

export const PARTNER_STATUS_LABELS: Record<DeliveryPartnerStatus, string> = {
  PENDING_VERIFICATION: 'Pending verification',
  DOCUMENT_REVIEW: 'Documents under review',
  VERIFIED: 'Verified',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  REJECTED: 'Rejected',
};

export const PARTNER_TYPE_LABELS: Record<DeliveryPartnerType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  GIG: 'Gig',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  AADHAAR: 'Aadhaar',
  PAN: 'PAN card',
  ADDRESS_PROOF: 'Address proof',
  DRIVING_LICENSE: 'Driving licence',
  RC: 'RC book',
  INSURANCE: 'Insurance',
  BANK_PROOF: 'Bank proof',
  PROFILE_PHOTO: 'Profile photo',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING: 'Pending',
  UPLOADED: 'Uploaded',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const REQUIRED_VERIFICATION_DOCUMENTS: readonly DocumentType[] = [
  'AADHAAR',
  'ADDRESS_PROOF',
  'PAN',
  'DRIVING_LICENSE',
];

export function isActiveAssignmentStatus(status: DeliveryAssignmentStatus): boolean {
  return (ASSIGNMENT_ACTIVE_STATUSES as readonly DeliveryAssignmentStatus[]).includes(status);
}
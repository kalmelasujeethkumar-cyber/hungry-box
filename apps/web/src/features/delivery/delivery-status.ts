import type {
  DeliveryAssignmentStatus,
  DeliveryAvailability,
  DeliveryPartnerStatus,
  DeliveryPartnerType,
  DocumentStatus,
  DocumentType,
  KycDocumentStatus,
  KycDocumentType,
  KycOverallState,
} from '@hungrybox/shared';
import type { BadgeTone } from '../../components/StatusBadge';

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

export const KYC_DOCUMENT_TYPES: readonly KycDocumentType[] = ['AADHAAR', 'DRIVING_LICENSE'];

export const KYC_DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  AADHAAR: 'Aadhaar',
  DRIVING_LICENSE: 'Driving licence',
};

export const KYC_DOCUMENT_STATUS_LABELS: Record<KycDocumentStatus, string> = {
  PENDING: 'Not uploaded',
  UPLOADED: 'Uploaded',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const KYC_OVERALL_LABELS: Record<KycOverallState, string> = {
  INCOMPLETE: 'KYC incomplete',
  ACTION_REQUIRED: 'KYC needs attention',
  AWAITING_REVIEW: 'KYC awaiting review',
  VERIFIED: 'KYC complete',
};

export const ASSIGNMENT_STATUS_TONES: Record<DeliveryAssignmentStatus, BadgeTone> = {
  ASSIGNED: 'gold',
  ACCEPTED: 'info',
  PICKED_UP: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export const AVAILABILITY_TONES: Record<DeliveryAvailability, BadgeTone> = {
  ONLINE: 'success',
  OFFLINE: 'neutral',
  ON_DELIVERY: 'info',
};

export const PARTNER_STATUS_TONES: Record<DeliveryPartnerStatus, BadgeTone> = {
  PENDING_VERIFICATION: 'warning',
  DOCUMENT_REVIEW: 'warning',
  VERIFIED: 'success',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
  REJECTED: 'danger',
};

export const DOCUMENT_STATUS_TONES: Record<DocumentStatus, BadgeTone> = {
  PENDING: 'neutral',
  UPLOADED: 'info',
  VERIFIED: 'success',
  REJECTED: 'danger',
};

export const KYC_DOCUMENT_STATUS_TONES: Record<KycDocumentStatus, BadgeTone> = {
  PENDING: 'neutral',
  UPLOADED: 'info',
  VERIFIED: 'success',
  REJECTED: 'danger',
};

export const KYC_OVERALL_TONES: Record<KycOverallState, BadgeTone> = {
  INCOMPLETE: 'neutral',
  ACTION_REQUIRED: 'danger',
  AWAITING_REVIEW: 'info',
  VERIFIED: 'success',
};

export const KYC_OVERALL_CHIP_CLASSES: Record<KycOverallState, string> = {
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  ACTION_REQUIRED: 'bg-rose-100 text-rose-700',
  AWAITING_REVIEW: 'bg-sky-100 text-brand-navy',
  INCOMPLETE: 'bg-slate-100 text-slate-600',
};

export const REQUIRED_VERIFICATION_DOCUMENTS: readonly DocumentType[] = [
  'AADHAAR',
  'DRIVING_LICENSE',
];

export function isActiveAssignmentStatus(status: DeliveryAssignmentStatus): boolean {
  return (ASSIGNMENT_ACTIVE_STATUSES as readonly DeliveryAssignmentStatus[]).includes(status);
}
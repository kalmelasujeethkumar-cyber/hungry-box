import type {
  DeliveryPartnerCandidateDto,
  DeliveryPartnerDocumentDto,
  DeliveryPartnerListItemDto,
  DeliveryPartnerProfileDto,
} from '@hungrybox/shared';
import { haversineKm } from '../locations/geo';

export interface PartnerBranchSource {
  id: string;
  name: string;
  code: string;
  city: string;
}

export interface PartnerDocumentSource {
  id: string;
  type: DeliveryPartnerDocumentDto['type'];
  documentReference: string | null;
  status: DeliveryPartnerDocumentDto['status'];
  verificationNote: string | null;
  verifiedAt: Date | null;
}

export interface PartnerProfileSource {
  id: string;
  partnerId: string;
  userId: string;
  branch: PartnerBranchSource;
  fullName: string;
  mobile: string | null;
  email: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  profilePhotoUrl: string | null;
  houseFlat: string | null;
  streetArea: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: { toString(): string } | number | null;
  longitude: { toString(): string } | number | null;
  identityVerified: boolean;
  addressProofVerified: boolean;
  drivingLicenceNumber: string | null;
  licenceType: string | null;
  licenceExpiry: Date | null;
  licenceVerified: boolean;
  vehicleType: string | null;
  vehicleNumber: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColour: string | null;
  registrationYear: number | null;
  rcReference: string | null;
  insuranceReference: string | null;
  insuranceExpiry: Date | null;
  ownVehicle: boolean | null;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  ifsc: string | null;
  payoutVerified: boolean;
  partnerType: DeliveryPartnerProfileDto['partnerType'];
  joinedAt: Date | null;
  status: DeliveryPartnerProfileDto['status'];
  availability: DeliveryPartnerProfileDto['availability'];
  wentOnlineAt: Date | null;
}

export function toDecimalNumber(value: { toString(): string } | number | null): number | null {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(String(value));
}

export function toPartnerProfileDto(
  profile: PartnerProfileSource,
  documents: PartnerDocumentSource[],
  activeDeliveryCount: number,
): DeliveryPartnerProfileDto {
  return {
    id: profile.id,
    partnerId: profile.partnerId,
    userId: profile.userId,
    branch: profile.branch,
    fullName: profile.fullName,
    mobile: profile.mobile,
    email: profile.email,
    dateOfBirth: profile.dateOfBirth?.toISOString() ?? null,
    gender: profile.gender,
    emergencyContactName: profile.emergencyContactName,
    emergencyContactPhone: profile.emergencyContactPhone,
    profilePhotoUrl: profile.profilePhotoUrl,
    houseFlat: profile.houseFlat,
    streetArea: profile.streetArea,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    latitude: toDecimalNumber(profile.latitude),
    longitude: toDecimalNumber(profile.longitude),
    identityVerified: profile.identityVerified,
    addressProofVerified: profile.addressProofVerified,
    drivingLicenceNumber: profile.drivingLicenceNumber,
    licenceType: profile.licenceType,
    licenceExpiry: profile.licenceExpiry?.toISOString() ?? null,
    licenceVerified: profile.licenceVerified,
    vehicleType: profile.vehicleType,
    vehicleNumber: profile.vehicleNumber,
    vehicleBrand: profile.vehicleBrand,
    vehicleModel: profile.vehicleModel,
    vehicleColour: profile.vehicleColour,
    registrationYear: profile.registrationYear,
    rcReference: profile.rcReference,
    insuranceReference: profile.insuranceReference,
    insuranceExpiry: profile.insuranceExpiry?.toISOString() ?? null,
    ownVehicle: profile.ownVehicle,
    accountHolderName: profile.accountHolderName,
    bankName: profile.bankName,
    accountNumberMasked: profile.accountNumberMasked,
    ifsc: profile.ifsc,
    payoutVerified: profile.payoutVerified,
    partnerType: profile.partnerType,
    joinedAt: profile.joinedAt?.toISOString() ?? null,
    status: profile.status,
    availability: profile.availability,
    wentOnlineAt: profile.wentOnlineAt?.toISOString() ?? null,
    activeDeliveryCount,
    documents: documents.map(toPartnerDocumentDto),
  };
}

export function toPartnerDocumentDto(document: PartnerDocumentSource): DeliveryPartnerDocumentDto {
  return {
    id: document.id,
    type: document.type,
    documentReference: document.documentReference,
    status: document.status,
    verificationNote: document.verificationNote,
    verifiedAt: document.verifiedAt?.toISOString() ?? null,
  };
}

export function toPartnerListItemDto(
  profile: {
    id: string;
    partnerId: string;
    fullName: string;
    mobile: string | null;
    branch: PartnerBranchSource;
    status: DeliveryPartnerProfileDto['status'];
    availability: DeliveryPartnerProfileDto['availability'];
    joinedAt: Date | null;
    latitude: { toString(): string } | number | null;
    longitude: { toString(): string } | number | null;
  },
  activeDeliveryCount: number,
  branchLatitude: { toString(): string } | number | null,
  branchLongitude: { toString(): string } | number | null,
): DeliveryPartnerListItemDto {
  return {
    id: profile.id,
    partnerId: profile.partnerId,
    fullName: profile.fullName,
    mobile: profile.mobile,
    branch: profile.branch,
    status: profile.status,
    availability: profile.availability,
    activeDeliveryCount,
    distanceKm: straightLineFrom(
      branchLatitude,
      branchLongitude,
      profile.latitude,
      profile.longitude,
    ),
    joinedAt: profile.joinedAt?.toISOString() ?? null,
  };
}

export function toPartnerCandidateDto(
  profile: {
    id: string;
    partnerId: string;
    fullName: string;
    status: DeliveryPartnerProfileDto['status'];
    availability: DeliveryPartnerProfileDto['availability'];
    latitude: { toString(): string } | number | null;
    longitude: { toString(): string } | number | null;
  },
  activeDeliveryCount: number,
  branchLatitude: { toString(): string } | number | null,
  branchLongitude: { toString(): string } | number | null,
): DeliveryPartnerCandidateDto {
  return {
    id: profile.id,
    partnerId: profile.partnerId,
    fullName: profile.fullName,
    status: profile.status,
    availability: profile.availability,
    online: profile.availability === 'ONLINE' && profile.status === 'ACTIVE',
    activeDeliveryCount,
    distanceKm: straightLineFrom(
      branchLatitude,
      branchLongitude,
      profile.latitude,
      profile.longitude,
    ),
  };
}

function straightLineFrom(
  lat1: { toString(): string } | number | null,
  lon1: { toString(): string } | number | null,
  lat2: { toString(): string } | number | null,
  lon2: { toString(): string } | number | null,
): number | null {
  const a = toDecimalNumber(lat1);
  const b = toDecimalNumber(lon1);
  const c = toDecimalNumber(lat2);
  const d = toDecimalNumber(lon2);
  if (a == null || b == null || c == null || d == null) return null;
  return Number(haversineKm(a, b, c, d).toFixed(1));
}
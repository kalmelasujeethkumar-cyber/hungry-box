export type KycDocumentType = 'AADHAAR' | 'DRIVING_LICENSE';

export type KycDocumentStatus = 'PENDING' | 'UPLOADED' | 'VERIFIED' | 'REJECTED';

export type KycOverallState = 'INCOMPLETE' | 'ACTION_REQUIRED' | 'AWAITING_REVIEW' | 'VERIFIED';

export interface KycDocumentDto {
  type: KycDocumentType;
  status: KycDocumentStatus;
  verificationNote: string | null;
  verifiedAt: string | null;
  canReupload: boolean;
}

export interface KycStatusDto {
  partnerId: string;
  fullName: string;
  branchId: string;
  branchName: string;
  overallState: KycOverallState;
  documents: KycDocumentDto[];
}

export interface KycListItemDto {
  partnerId: string;
  fullName: string;
  mobile: string;
  status: string;
  overallState: KycOverallState;
  hasAadhaar: boolean;
  hasDrivingLicense: boolean;
}

export interface KycReviewInput {
  action: 'VERIFY' | 'REJECT';
  note?: string;
}

export interface KycDocumentAccessDto {
  url: string;
  expiresAt: string;
}
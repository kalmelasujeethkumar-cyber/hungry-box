import type { KycOverallState } from '@hungrybox/shared';

/**
 * Document state for one partner, derived from their uploaded documents.
 *
 * This is the single definition of "has this partner supplied the required documents,
 * and what still needs attention". The KYC endpoints and the management partner list both
 * read it, so a row in the partner list cannot disagree with the partner's KYC page.
 *
 * Only the two required-document flags and the overall verdict are produced. Document
 * ids, storage paths and verification notes are deliberately not part of this summary.
 */
export interface KycSummary {
  overallState: KycOverallState;
  hasAadhaar: boolean;
  hasDrivingLicense: boolean;
}

export type KycDocumentSummaryRow = ReadonlyArray<{ type: string; status: string }>;

export function toKycOverallState(documents: KycDocumentSummaryRow): KycOverallState {
  const aadhaar = documents.find((document) => document.type === 'AADHAAR');
  const drivingLicense = documents.find((document) => document.type === 'DRIVING_LICENSE');
  if (aadhaar?.status === 'VERIFIED' && drivingLicense?.status === 'VERIFIED') {
    return 'VERIFIED';
  }
  if (aadhaar?.status === 'REJECTED' || drivingLicense?.status === 'REJECTED') {
    return 'ACTION_REQUIRED';
  }
  const anyUploaded = documents.some(
    (document) =>
      (document.type === 'AADHAAR' || document.type === 'DRIVING_LICENSE') &&
      document.status !== 'PENDING',
  );
  return anyUploaded ? 'AWAITING_REVIEW' : 'INCOMPLETE';
}

export function toKycSummary(documents: KycDocumentSummaryRow): KycSummary {
  return {
    overallState: toKycOverallState(documents),
    hasAadhaar: documents.some(
      (document) => document.type === 'AADHAAR' && document.status !== 'PENDING',
    ),
    hasDrivingLicense: documents.some(
      (document) => document.type === 'DRIVING_LICENSE' && document.status !== 'PENDING',
    ),
  };
}

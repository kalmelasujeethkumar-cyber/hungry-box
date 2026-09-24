import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_ACTIVE_STATUSES,
  ASSIGNMENT_STATUS_LABELS,
  AVAILABILITY_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PARTNER_STATUS_LABELS,
  PARTNER_TYPE_LABELS,
  REQUIRED_VERIFICATION_DOCUMENTS,
  isActiveAssignmentStatus,
} from './delivery-status';

describe('delivery-status runtime labels', () => {
  it('provides presentational labels for every assignment status', () => {
    expect(Object.keys(ASSIGNMENT_STATUS_LABELS).sort()).toEqual(
      ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'].sort(),
    );
    expect(ASSIGNMENT_STATUS_LABELS.ASSIGNED).toContain('assigned');
  });

  it('labels partner availability and account statuses', () => {
    expect(AVAILABILITY_LABELS.ONLINE).toBe('Online');
    expect(PARTNER_STATUS_LABELS.ACTIVE).toBe('Active');
    expect(PARTNER_STATUS_LABELS.PENDING_VERIFICATION).toContain('Pending');
  });

  it('labels document types and review states and lists the required set', () => {
    expect(DOCUMENT_STATUS_LABELS.VERIFIED).toBe('Verified');
    expect(DOCUMENT_TYPE_LABELS.AADHAAR).toBe('Aadhaar');
    expect(REQUIRED_VERIFICATION_DOCUMENTS).toEqual(['AADHAAR', 'ADDRESS_PROOF', 'PAN', 'DRIVING_LICENSE']);
  });

  it('marks a status as active only within the live assignment window', () => {
    expect(ASSIGNMENT_ACTIVE_STATUSES).toEqual(['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY']);
    expect(isActiveAssignmentStatus('ACCEPTED')).toBe(true);
    expect(isActiveAssignmentStatus('OUT_FOR_DELIVERY')).toBe(true);
    expect(isActiveAssignmentStatus('DELIVERED')).toBe(false);
    expect(isActiveAssignmentStatus('REJECTED')).toBe(false);
    expect(isActiveAssignmentStatus('CANCELLED')).toBe(false);
  });

  it('keeps partner type labels human-readable for the UI', () => {
    expect(PARTNER_TYPE_LABELS.GIG).toBe('Gig');
    expect(PARTNER_TYPE_LABELS.FULL_TIME).toBe('Full time');
  });
});
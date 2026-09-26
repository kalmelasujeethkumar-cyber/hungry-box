import type { BadgeTone } from './StatusBadge';
import type { BranchStatus } from '@hungrybox/shared';
import type { CatalogStatus } from '@hungrybox/shared';
import type { UserStatus } from '@hungrybox/shared';

export const branchStatusLabel: Record<BranchStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  INACTIVE: 'Inactive',
};

export const branchStatusTone: Record<BranchStatus, BadgeTone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  INACTIVE: 'neutral',
};

export const userStatusLabel: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  PENDING: 'Pending',
};

export const userStatusTone: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
  PENDING: 'warning',
};

export const catalogStatusLabel: Record<CatalogStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

export const catalogStatusTone: Record<CatalogStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
};

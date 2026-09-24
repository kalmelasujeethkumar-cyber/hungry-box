export const BRANCH_STATUSES = ['ACTIVE', 'PAUSED', 'INACTIVE'] as const;

export type BranchStatus = (typeof BRANCH_STATUSES)[number];

export interface BranchDto {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  country: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  deliveryRadiusKm: number;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
}

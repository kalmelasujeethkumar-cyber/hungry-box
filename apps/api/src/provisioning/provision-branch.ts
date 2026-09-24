import { BranchStatus } from '../generated/prisma/enums';

const BRANCH_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

export interface ProvisionBranchInput {
  code: string;
  name: string;
  city: string;
  state: string;
  country: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  deliveryRadiusKm: number;
}

export type ProvisionBranchResult =
  | { outcome: 'created'; branchId: string }
  | { outcome: 'already_exists'; branchId: string }
  | { outcome: 'invalid'; reason: string };

export interface ProvisionBranchDeps {
  findBranchByCode(code: string): Promise<{ id: string } | null>;
  createBranch(input: {
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
  }): Promise<{ id: string }>;
}

export function validateBranchInput(input: ProvisionBranchInput): string | null {
  if (!BRANCH_CODE_PATTERN.test(input.code)) {
    return 'Code must be lowercase alphanumeric (hyphens allowed), 2 to 50 characters';
  }
  if (!input.name?.trim()) return 'Name is required';
  if (!input.city?.trim()) return 'City is required';
  if (!input.state?.trim()) return 'State is required';
  if (!input.country?.trim()) return 'Country is required';
  if (
    !Number.isFinite(input.deliveryRadiusKm) ||
    input.deliveryRadiusKm < 1 ||
    input.deliveryRadiusKm > 100
  ) {
    return 'deliveryRadiusKm must be a number between 1 and 100';
  }
  if (input.latitude !== undefined && !Number.isFinite(input.latitude)) {
    return 'latitude must be a number';
  }
  if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90)) {
    return 'latitude must be between -90 and 90';
  }
  if (input.longitude !== undefined && !Number.isFinite(input.longitude)) {
    return 'longitude must be a number';
  }
  if (input.longitude !== undefined && (input.longitude < -180 || input.longitude > 180)) {
    return 'longitude must be between -180 and 180';
  }
  return null;
}

export async function provisionBranch(
  input: ProvisionBranchInput,
  deps: ProvisionBranchDeps,
): Promise<ProvisionBranchResult> {
  const invalid = validateBranchInput(input);
  if (invalid) {
    return { outcome: 'invalid', reason: invalid };
  }

  const existing = await deps.findBranchByCode(input.code);
  if (existing) {
    return { outcome: 'already_exists', branchId: existing.id };
  }

  const created = await deps.createBranch({
    code: input.code,
    name: input.name.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    country: input.country.trim(),
    address: input.address?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    deliveryRadiusKm: input.deliveryRadiusKm,
    status: BranchStatus.ACTIVE,
  });
  return { outcome: 'created', branchId: created.id };
}

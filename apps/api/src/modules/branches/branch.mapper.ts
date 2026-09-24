import type { BranchDto } from '@hungrybox/shared';
import type { Branch } from '../../generated/prisma/client';

export function toBranchDto(branch: Branch): BranchDto {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    city: branch.city,
    state: branch.state,
    country: branch.country,
    address: branch.address,
    latitude: branch.latitude == null ? null : Number(branch.latitude),
    longitude: branch.longitude == null ? null : Number(branch.longitude),
    deliveryRadiusKm: Number(branch.deliveryRadiusKm),
    status: branch.status,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

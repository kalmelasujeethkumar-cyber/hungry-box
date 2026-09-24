import { Injectable } from '@nestjs/common';
import { BranchStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineKm } from './geo';

export interface LocatorBranch {
  branchId: string;
  name: string;
  code: string;
  city: string;
  deliveryRadiusKm: number;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

@Injectable()
export class BranchLocatorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds active branches that carry coordinates and ranks them by haversine
   * distance from the supplied point (nearest first).
   */
  async locate(latitude: number, longitude: number): Promise<LocatorBranch | null> {
    const db = this.prisma.requireClient();
    const branches = await db.branch.findMany({
      where: {
        status: BranchStatus.ACTIVE,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        deliveryRadiusKm: true,
        latitude: true,
        longitude: true,
      },
    });

    const located = branches
      .map((branch) => {
        const branchLatitude = Number(branch.latitude);
        const branchLongitude = Number(branch.longitude);
        return {
          branchId: branch.id,
          name: branch.name,
          code: branch.code,
          city: branch.city,
          deliveryRadiusKm: Number(branch.deliveryRadiusKm),
          latitude: branchLatitude,
          longitude: branchLongitude,
          distanceKm: haversineKm(latitude, longitude, branchLatitude, branchLongitude),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return located[0] ?? null;
  }
}

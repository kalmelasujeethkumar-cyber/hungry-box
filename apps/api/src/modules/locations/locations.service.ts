import { Injectable } from '@nestjs/common';
import type { ServiceabilityResult } from '@hungrybox/shared';
import { BranchLocatorService } from './branch-locator.service';

@Injectable()
export class LocationsService {
  constructor(private readonly branchLocator: BranchLocatorService) {}

  async check(latitude: number, longitude: number): Promise<ServiceabilityResult> {
    const nearest = await this.branchLocator.locate(latitude, longitude);
    if (!nearest) {
      return { serviceable: false, distanceKm: null, branch: null };
    }

    const serviceable = nearest.distanceKm <= nearest.deliveryRadiusKm;
    return {
      serviceable,
      distanceKm: Math.round(nearest.distanceKm * 10) / 10,
      branch: serviceable
        ? {
            id: nearest.branchId,
            name: nearest.name,
            code: nearest.code,
            city: nearest.city,
            deliveryRadiusKm: nearest.deliveryRadiusKm,
          }
        : null,
    };
  }
}

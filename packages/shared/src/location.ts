export interface ServiceabilityBranch {
  id: string;
  name: string;
  code: string;
  city: string;
  deliveryRadiusKm: number;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  distanceKm: number | null;
  branch: ServiceabilityBranch | null;
}

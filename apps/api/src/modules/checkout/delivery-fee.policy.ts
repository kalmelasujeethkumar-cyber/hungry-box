import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DeliveryFeeContext {
  branchId: string;
  deliveryRadiusKm: number;
  itemCount: number;
  totalMinor: number;
}

export interface DeliveryFeePolicy {
  readonly id: string;
  compute(context: DeliveryFeeContext): number;
}

@Injectable()
export class DefaultDeliveryFeePolicy implements DeliveryFeePolicy {
  readonly id = 'flat';

  constructor(private readonly config: ConfigService) {}

  compute(context: DeliveryFeeContext): number {
    const baseFee = Number(this.config.get<number>('DELIVERY_FEE_MINOR', 3000));
    const normalized = Number.isFinite(baseFee) && baseFee >= 0 ? Math.trunc(baseFee) : 3000;
    return context.itemCount > 0 ? normalized : 0;
  }
}

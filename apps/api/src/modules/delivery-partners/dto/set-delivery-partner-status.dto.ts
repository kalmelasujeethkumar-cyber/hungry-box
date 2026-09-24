import { IsEnum } from 'class-validator';
import type { ActivePartnerStatus } from '@hungrybox/shared';

export class SetDeliveryPartnerStatusDto {
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const)
  status!: ActivePartnerStatus;
}
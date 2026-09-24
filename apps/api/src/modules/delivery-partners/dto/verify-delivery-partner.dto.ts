import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { PartnerStatusAction } from '@hungrybox/shared';

export class VerifyDeliveryPartnerDto {
  @IsEnum(['BEGIN_REVIEW', 'APPROVE', 'ACTIVATE', 'REJECT'] as const)
  action!: PartnerStatusAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
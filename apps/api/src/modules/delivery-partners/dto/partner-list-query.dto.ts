import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { DeliveryAvailability, DeliveryPartnerStatus } from '@hungrybox/shared';

export const PARTNER_LIST_DEFAULT_LIMIT = 50;
export const PARTNER_LIST_MAX_LIMIT = 100;

export class PartnerListQueryDto {
  @IsOptional()
  @IsEnum([
    'PENDING_VERIFICATION',
    'DOCUMENT_REVIEW',
    'VERIFIED',
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'REJECTED',
  ] as const)
  status?: DeliveryPartnerStatus;

  @IsOptional()
  @IsEnum(['OFFLINE', 'ONLINE', 'ON_DELIVERY'] as const)
  availability?: DeliveryAvailability;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(PARTNER_LIST_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Honoured only for SUPER_ADMIN; BRANCH_MANAGER is always pinned to their own branch. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;
}

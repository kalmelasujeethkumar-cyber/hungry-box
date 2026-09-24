import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { DeliveryAssignmentStatus } from '@hungrybox/shared';

export class BranchAssignmentListQueryDto {
  @IsOptional()
  @IsEnum([
    'ASSIGNED',
    'ACCEPTED',
    'PICKED_UP',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'REJECTED',
    'CANCELLED',
  ] as const)
  status?: DeliveryAssignmentStatus;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Honoured only for SUPER_ADMIN; BRANCH_MANAGER is always pinned to their own branch. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;
}

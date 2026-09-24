import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
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
}
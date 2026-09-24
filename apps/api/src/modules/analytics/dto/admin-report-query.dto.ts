import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AdminReportQuery, OrderStatus } from '@hungrybox/shared';

export class AdminReportQueryDto implements AdminReportQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsEnum([
    'PLACED',
    'CONFIRMED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
  ] as const)
  status?: OrderStatus;
}

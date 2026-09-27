import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AdminDashboardQuery, DashboardBucket, OrderStatus } from '@hungrybox/shared';

export class AdminDashboardQueryDto implements AdminDashboardQuery {
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
  @IsEnum(['day', 'week', 'month', 'year'] as const)
  bucket?: DashboardBucket;

  /**
   * Spelled out inline rather than imported from the shared package because
   * `@hungrybox/shared` currently builds declarations only, so it has no runtime values.
   * This mirrors `AdminReportQueryDto` and must stay in step with `OrderStatus`.
   */
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

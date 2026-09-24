import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AdminDashboardQuery, DashboardBucket } from '@hungrybox/shared';

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
}

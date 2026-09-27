import { Transform } from 'class-transformer';
import { IsISO8601, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const BRANCH_ORDER_STATUS_CHOICES = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export const BRANCH_ORDER_DEFAULT_LIMIT = 25;
export const BRANCH_ORDER_MAX_LIMIT = 100;

export class BranchOrderListQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsIn(BRANCH_ORDER_STATUS_CHOICES)
  status?: (typeof BRANCH_ORDER_STATUS_CHOICES)[number];

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Query parameters arrive as strings. The global ValidationPipe runs with `transform`
   * but without implicit conversion, so without an explicit transform `?page=1` stays the
   * string "1" and @IsInt() rejects the request outright - a 400 for every real browser
   * call while service-level unit tests, which pass numbers directly, keep passing.
   * Matches the transform used by the audit and partner list DTOs.
   */
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(BRANCH_ORDER_MAX_LIMIT)
  limit?: number;
}

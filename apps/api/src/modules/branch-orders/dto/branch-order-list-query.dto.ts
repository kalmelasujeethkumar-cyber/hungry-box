import { IsISO8601, IsIn, IsOptional, IsString } from 'class-validator';

const BRANCH_ORDER_STATUS_CHOICES = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

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
}

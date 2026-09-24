import { IsBoolean, IsEmpty, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { BranchProductStatus } from '@hungrybox/shared';

export class UpdateBranchProductDto {
  @IsEmpty()
  branchId?: undefined;

  @IsEmpty()
  productId?: undefined;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  priceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  discountMinor?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'] as const)
  status?: BranchProductStatus;
}

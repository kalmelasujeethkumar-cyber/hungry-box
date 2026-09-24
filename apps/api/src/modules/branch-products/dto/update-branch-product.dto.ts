import { IsBoolean, IsEmpty, IsInt, IsOptional, Max, Min } from 'class-validator';

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
}

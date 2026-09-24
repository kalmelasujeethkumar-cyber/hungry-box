import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateBranchProductDto {
  @IsString()
  @MaxLength(64)
  branchId!: string;

  @IsString()
  @MaxLength(64)
  productId!: string;

  @IsInt()
  @Min(0)
  @Max(100_000_00)
  priceMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  discountMinor?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

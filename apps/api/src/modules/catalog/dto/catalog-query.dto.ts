import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CatalogQueryDto {
  @IsString()
  @MaxLength(64)
  branchId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categorySlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

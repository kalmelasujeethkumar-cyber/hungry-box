import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { UpdateProductInput } from '@hungrybox/shared';

export class UpdateProductDto implements UpdateProductInput {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,119}$/, {
    message: 'Slug must be lowercase alphanumeric (hyphens allowed)',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'] as const)
  status?: 'ACTIVE' | 'INACTIVE';
}

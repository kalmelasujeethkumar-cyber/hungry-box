import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import type { UpdateCategoryInput } from '@hungrybox/shared';

export class UpdateCategoryDto implements UpdateCategoryInput {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,119}$/, {
    message: 'Slug must be lowercase alphanumeric (hyphens allowed)',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'] as const)
  status?: 'ACTIVE' | 'INACTIVE';
}

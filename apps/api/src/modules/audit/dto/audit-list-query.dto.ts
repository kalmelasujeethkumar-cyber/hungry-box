import { Transform } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { AuditListQuery } from '@hungrybox/shared';

export class AuditListQueryDto implements AuditListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

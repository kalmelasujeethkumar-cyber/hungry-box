import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { UpdateBranchSettingsInput } from '@hungrybox/shared';

export class UpdateBranchSettingsDto implements UpdateBranchSettingsInput {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(50)
  deliveryRadiusKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

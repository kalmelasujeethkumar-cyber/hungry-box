import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(24)
  label?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  houseFlat!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  streetArea!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  state!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  postalCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryInstructions?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

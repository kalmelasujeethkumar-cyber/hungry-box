import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { DeliveryPartnerType } from '@hungrybox/shared';

export class CreateDeliveryPartnerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  loginId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  houseFlat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  streetArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @IsOptional()
  @Matches(/^\d{4,10}$/, { message: 'postalCode must be numeric' })
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleColour?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsBoolean()
  ownVehicle?: boolean;

  @IsOptional()
  @IsEnum(['FULL_TIME', 'PART_TIME', 'GIG'] as const)
  partnerType?: DeliveryPartnerType;
}
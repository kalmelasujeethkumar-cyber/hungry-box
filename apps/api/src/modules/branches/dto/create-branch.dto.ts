import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,49}$/, {
    message: 'Code must be lowercase alphanumeric (hyphens allowed)',
  })
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(80)
  city!: string;

  @IsString()
  @MaxLength(80)
  state!: string;

  @IsString()
  @MaxLength(80)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  deliveryRadiusKm!: number;
}

import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AssignOrderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  deliveryPartnerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
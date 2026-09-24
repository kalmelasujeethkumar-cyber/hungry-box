import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  paymentId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  addressId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

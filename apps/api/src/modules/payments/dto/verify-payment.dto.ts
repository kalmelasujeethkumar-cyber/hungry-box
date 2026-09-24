import { IsString, MinLength } from 'class-validator';

export class VerifyPaymentDto {
  @IsString()
  @MinLength(1)
  paymentId!: string;
}

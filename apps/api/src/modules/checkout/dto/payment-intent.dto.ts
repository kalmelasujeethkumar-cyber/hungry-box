import { IsIn, IsString, MinLength } from 'class-validator';

const PAYMENT_METHOD_CHOICES = ['UPI', 'CARD', 'NET_BANKING', 'WALLET'] as const;

export class CreatePaymentIntentInput {
  @IsString()
  @MinLength(1)
  addressId!: string;

  @IsIn(PAYMENT_METHOD_CHOICES)
  method!: (typeof PAYMENT_METHOD_CHOICES)[number];
}

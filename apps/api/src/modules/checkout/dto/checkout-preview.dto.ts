import { IsString, MinLength } from 'class-validator';

export class CheckoutPreviewDto {
  @IsString()
  @MinLength(1)
  addressId!: string;
}

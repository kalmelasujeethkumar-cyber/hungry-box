import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { CheckoutService } from './checkout.service';
import { CheckoutPreviewDto } from './dto/checkout-preview.dto';
import { CreatePaymentIntentInput } from './dto/payment-intent.dto';

@Controller('checkout')
@Roles('CUSTOMER')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('preview')
  preview(@CurrentUser() user: RequestUser, @Body() dto: CheckoutPreviewDto) {
    return this.checkoutService.preview(user.sub, dto.addressId);
  }

  @Post('payment-intent')
  paymentIntent(@CurrentUser() user: RequestUser, @Body() dto: CreatePaymentIntentInput) {
    return this.checkoutService.createPaymentIntent(user.sub, dto);
  }
}

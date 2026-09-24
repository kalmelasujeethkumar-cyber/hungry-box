import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutValidationService } from './checkout-validation.service';
import { DefaultDeliveryFeePolicy } from './delivery-fee.policy';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutValidationService, DefaultDeliveryFeePolicy],
  exports: [CheckoutValidationService],
})
export class CheckoutModule {}

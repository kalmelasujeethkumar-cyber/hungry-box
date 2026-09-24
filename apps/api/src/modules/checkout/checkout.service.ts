import { Injectable } from '@nestjs/common';
import type { CheckoutPreviewDto, PaymentIntentDto } from '@hungrybox/shared';
import { CheckoutConflictException } from '../../common/exceptions/checkout-conflict.exception';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import { PaymentsService } from '../payments/payments.service';
import { toCheckoutPreview, toPaymentIntentDto } from './checkout.mapper';
import { CheckoutValidationService } from './checkout-validation.service';
import type { CreatePaymentIntentInput } from './dto/payment-intent.dto';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly checkoutValidation: CheckoutValidationService,
    private readonly payments: PaymentsService,
    private readonly paymentProviders: PaymentProviderRegistry,
  ) {}

  async preview(customerId: string, addressId: string): Promise<CheckoutPreviewDto> {
    const validated = await this.checkoutValidation.resolve(customerId, addressId);
    const provider = await this.paymentProviders.current();
    return toCheckoutPreview(validated, provider.supportedMethods);
  }

  async createPaymentIntent(
    customerId: string,
    dto: CreatePaymentIntentInput,
  ): Promise<PaymentIntentDto> {
    const validated = await this.checkoutValidation.resolve(customerId, dto.addressId);
    const provider = await this.paymentProviders.current();
    const preview = toCheckoutPreview(validated, provider.supportedMethods);

    if (!validated.serviceable) {
      throw new CheckoutConflictException(
        'checkout.unserviceable',
        preview,
        'This address is outside the branch delivery area',
      );
    }
    if (validated.unavailableItems.length > 0) {
      throw new CheckoutConflictException(
        'checkout.unavailable',
        preview,
        'Some items in your cart are no longer available',
      );
    }
    if (validated.priceChanges.length > 0) {
      throw new CheckoutConflictException(
        'checkout.prices_changed',
        preview,
        'Item prices changed; review the updated total before paying',
      );
    }

    const created = await this.payments.createForCheckout(customerId, {
      amountMinor: validated.totalMinor,
      currency: 'INR',
      method: dto.method,
    });
    return toPaymentIntentDto(created);
  }
}

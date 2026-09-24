import type {
  CheckoutAddressDto,
  CheckoutPreviewDto,
  PaymentIntentDto,
  PaymentMethod,
} from '@hungrybox/shared';
import type { CreatedPayment } from '../payments/payments.service';
import type { ValidatedCheckout } from './checkout-validation.service';

export function toCheckoutPreview(
  validated: ValidatedCheckout,
  availableMethods: readonly PaymentMethod[],
): CheckoutPreviewDto {
  const status =
    validated.unavailableItems.length > 0
      ? 'unavailable'
      : !validated.serviceable
        ? 'unserviceable'
        : 'ok';

  const issues: string[] = [];
  if (!validated.serviceable) {
    issues.push('This address is outside the branch delivery area');
  }
  for (const item of validated.unavailableItems) {
    issues.push(`${item.productName} is ${item.reason.toLowerCase()}`);
  }
  if (validated.priceChanges.length > 0) {
    issues.push('Some prices changed since the item was added to your cart');
  }

  return {
    branch: validated.branch,
    address: toCheckoutAddress(validated.address),
    status,
    issues,
    items: validated.items,
    unavailableItems: validated.unavailableItems,
    priceChanges: validated.priceChanges,
    serviceable: validated.serviceable,
    distanceKm: validated.distanceKm,
    subtotalMinor: validated.subtotalMinor,
    discountMinor: validated.discountMinor,
    deliveryFeeMinor: validated.deliveryFeeMinor,
    taxMinor: validated.taxMinor,
    totalMinor: validated.totalMinor,
    itemCount: validated.itemCount,
    needsConfirmation: validated.priceChanges.length > 0,
    availablePaymentMethods: [...availableMethods],
  };
}

export function toPaymentIntentDto(payment: CreatedPayment): PaymentIntentDto {
  return {
    paymentId: payment.paymentId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
  };
}

export function toCheckoutAddress(address: ValidatedCheckout['address']): CheckoutAddressDto {
  return {
    id: address.id,
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    houseFlat: address.houseFlat,
    streetArea: address.streetArea,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    latitude: address.latitude == null ? null : Number(address.latitude),
    longitude: address.longitude == null ? null : Number(address.longitude),
    deliveryInstructions: address.deliveryInstructions,
  };
}

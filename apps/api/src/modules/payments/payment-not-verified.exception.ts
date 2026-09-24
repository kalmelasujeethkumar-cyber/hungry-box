import { BadRequestException } from '@nestjs/common';
import type { PaymentStatus } from '@hungrybox/shared';

export class PaymentNotVerifiedException extends BadRequestException {
  readonly paymentStatus: PaymentStatus;
  readonly failureReason: string | null;

  constructor(paymentStatus: PaymentStatus, failureReason: string | null) {
    super({
      statusCode: 400,
      code: 'payment.not_verified',
      paymentStatus,
      failureReason,
      message: 'Payment could not be verified',
    });
    this.name = 'PaymentNotVerifiedException';
    this.paymentStatus = paymentStatus;
    this.failureReason = failureReason;
  }
}

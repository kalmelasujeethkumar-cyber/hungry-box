import { ConflictException } from '@nestjs/common';
import type { CheckoutPreviewDto } from '@hungrybox/shared';

export type CheckoutConflictCode =
  'checkout.prices_changed' | 'checkout.unavailable' | 'checkout.unserviceable';

export class CheckoutConflictException extends ConflictException {
  readonly code: CheckoutConflictCode;
  readonly preview: CheckoutPreviewDto | null;

  constructor(code: CheckoutConflictCode, preview: CheckoutPreviewDto | null, message?: string) {
    super({
      statusCode: 409,
      code,
      preview,
      message: message ?? code,
    });
    this.name = 'CheckoutConflictException';
    this.code = code;
    this.preview = preview;
  }
}

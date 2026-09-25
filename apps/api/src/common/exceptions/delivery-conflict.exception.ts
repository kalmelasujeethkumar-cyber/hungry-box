import { ConflictException } from '@nestjs/common';

export type DeliveryConflictCode =
  | 'delivery.order_not_ready'
  | 'delivery.partner_ineligible'
  | 'delivery.partner_busy'
  | 'delivery.already_assigned'
  | 'delivery.already_handled'
  | 'delivery.not_assigned'
  | 'delivery.wrong_state'
  | 'delivery.partner_suspended'
  | 'delivery.partner_offline'
  | 'delivery.active_delivery_pending'
  | 'delivery.location_offline'
  | 'delivery.cash_not_collected';

export class DeliveryConflictException extends ConflictException {
  readonly code: DeliveryConflictCode;

  constructor(code: DeliveryConflictCode, message?: string) {
    super({
      statusCode: 409,
      code,
      message: message ?? code,
    });
    this.name = 'DeliveryConflictException';
    this.code = code;
  }
}
import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_DELIVERY_PARTNER_KEY = 'allow_inactive_delivery_partner';

export const AllowInactiveDeliveryPartner = () =>
  SetMetadata(ALLOW_INACTIVE_DELIVERY_PARTNER_KEY, true);
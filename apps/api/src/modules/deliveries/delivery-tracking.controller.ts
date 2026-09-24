import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { DeliveryTrackingService } from './delivery-tracking.service';

@Controller('orders')
@Roles('CUSTOMER')
export class DeliveryTrackingController {
  constructor(private readonly tracking: DeliveryTrackingService) {}

  @Get(':orderId/delivery-tracking')
  track(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string) {
    return this.tracking.getTracking(user.sub, orderId);
  }
}
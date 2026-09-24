import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { DeliveryMeService } from './delivery-me.service';
import { SetupAvailabilityDto } from './dto/setup-availability.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

@Controller('delivery')
@Roles('DELIVERY_PARTNER')
export class DeliveryMeController {
  constructor(private readonly me: DeliveryMeService) {}

  @Get('profile')
  profile(@CurrentUser() user: RequestUser) {
    return this.me.getProfile(user.sub);
  }

  @Post('availability')
  availability(@CurrentUser() user: RequestUser, @Body() dto: SetupAvailabilityDto) {
    return this.me.setAvailability(user.sub, dto.availability);
  }

  @Post('location')
  location(@CurrentUser() user: RequestUser, @Body() dto: UpdateDeliveryLocationDto) {
    return this.me.updateLocation(user.sub, dto);
  }
}
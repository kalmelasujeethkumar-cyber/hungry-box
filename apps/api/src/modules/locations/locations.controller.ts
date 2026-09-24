import { Body, Controller, Post } from '@nestjs/common';
import { ServiceabilityDto } from './dto/serviceability.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post('serviceability')
  check(@Body() dto: ServiceabilityDto) {
    return this.locationsService.check(dto.latitude, dto.longitude);
  }
}

import { Module } from '@nestjs/common';
import { BranchLocatorService } from './branch-locator.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, BranchLocatorService],
})
export class LocationsModule {}

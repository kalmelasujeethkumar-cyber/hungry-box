import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuditModule } from '../audit/audit.module';
import { BranchPartnersController } from './branch-partners.controller';
import { DeliveryMeController } from './delivery-me.controller';
import { DeliveryMeService } from './delivery-me.service';
import { DeliveryPartnerService } from './delivery-partner.service';
import { PartnerIdService } from './partner-id.service';

@Module({
  imports: [RealtimeModule, AuditModule],
  controllers: [BranchPartnersController, DeliveryMeController],
  providers: [DeliveryPartnerService, DeliveryMeService, PartnerIdService],
  exports: [DeliveryPartnerService],
})
export class DeliveryPartnersModule {}
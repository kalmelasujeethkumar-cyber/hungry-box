import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeliveryPartnersModule } from '../delivery-partners/delivery-partners.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BranchDeliveryController } from './branch-delivery.controller';
import { DeliveryAssignmentsController } from './delivery-assignments.controller';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { DeliveryEventsService } from './delivery-events.service';
import { DeliveryTrackingController } from './delivery-tracking.controller';
import { DeliveryTrackingService } from './delivery-tracking.service';

@Module({
  imports: [
    RealtimeModule,
    NotificationsModule,
    DeliveryPartnersModule,
    OrdersModule,
    AuditModule,
  ],
  controllers: [
    BranchDeliveryController,
    DeliveryAssignmentsController,
    DeliveryTrackingController,
  ],
  providers: [
    DeliveryAssignmentService,
    DeliveryEventsService,
    DeliveryTrackingService,
  ],
})
export class DeliveriesModule {}
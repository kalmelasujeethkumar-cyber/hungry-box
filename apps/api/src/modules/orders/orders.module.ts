import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrderNumberService } from './order-number.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderStateService } from './order-state.service';

@Module({
  imports: [PrismaModule, CheckoutModule, PaymentsModule, AuditModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderNumberService, OrderStateService],
  exports: [OrdersService, OrderStateService],
})
export class OrdersModule {}

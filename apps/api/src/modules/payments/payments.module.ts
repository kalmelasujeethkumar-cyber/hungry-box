import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { DevPaymentProvider } from './dev-payment.provider';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PaymentsController],
  providers: [DevPaymentProvider, PaymentProviderRegistry, PaymentsService],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { BranchOrdersController } from './branch-orders.controller';
import { BranchOrdersService } from './branch-orders.service';

@Module({
  imports: [PrismaModule, AuditModule, OrdersModule],
  controllers: [BranchOrdersController],
  providers: [BranchOrdersService],
})
export class BranchOrdersModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BranchProductsController } from './branch-products.controller';
import { BranchProductsService } from './branch-products.service';

@Module({
  imports: [AuditModule],
  controllers: [BranchProductsController],
  providers: [BranchProductsService],
  exports: [BranchProductsService],
})
export class BranchProductsModule {}

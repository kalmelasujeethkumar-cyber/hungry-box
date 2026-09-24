import { Module } from '@nestjs/common';
import { BranchProductsController } from './branch-products.controller';
import { BranchProductsService } from './branch-products.service';

@Module({
  controllers: [BranchProductsController],
  providers: [BranchProductsService],
  exports: [BranchProductsService],
})
export class BranchProductsModule {}

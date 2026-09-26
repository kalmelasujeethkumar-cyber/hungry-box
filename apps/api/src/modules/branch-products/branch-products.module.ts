import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media-storage.module';
import { BranchProductImagesService } from './branch-product-images.service';
import { BranchProductsController } from './branch-products.controller';
import { BranchProductsService } from './branch-products.service';

@Module({
  imports: [AuditModule, MediaModule],
  controllers: [BranchProductsController],
  providers: [BranchProductsService, BranchProductImagesService],
  exports: [BranchProductsService],
})
export class BranchProductsModule {}

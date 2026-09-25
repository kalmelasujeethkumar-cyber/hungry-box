import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media-storage.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [AuditModule, MediaModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}

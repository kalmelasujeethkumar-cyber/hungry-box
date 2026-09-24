import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [CategoriesModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('products')
  products(@Query() query: CatalogQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get('products/:productId')
  product(@Param('productId') productId: string, @Query() query: CatalogQueryDto) {
    return this.catalogService.getProductDetail(productId, query.branchId);
  }

  @Get('categories')
  categories(@Query('branchId') branchId?: string) {
    return this.catalogService.listCategories(branchId);
  }
}

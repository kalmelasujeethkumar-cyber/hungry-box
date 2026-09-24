import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { SetProductStatusDto } from './dto/set-product-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ProductActor, ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list() {
    return this.productsService.list();
  }

  @Get('admin')
  @Roles('SUPER_ADMIN')
  listAdmin() {
    return this.productsService.listAdmin();
  }

  @Get('admin/:id')
  @Roles('SUPER_ADMIN')
  getAdmin(@Param('id') id: string) {
    return this.productsService.getAdminDetail(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.productsService.getById(id);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(this.actor(user), dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(this.actor(user), id, dto);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN')
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetProductStatusDto,
  ) {
    return this.productsService.setStatus(this.actor(user), id, dto);
  }

  @Post(':id/images')
  @Roles('SUPER_ADMIN')
  addImage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.productsService.addImage(this.actor(user), id, dto);
  }

  @Patch('images/:imageId')
  @Roles('SUPER_ADMIN')
  updateImage(
    @CurrentUser() user: RequestUser,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductImageDto,
  ) {
    return this.productsService.updateImage(this.actor(user), imageId, dto);
  }

  @Delete('images/:imageId')
  @Roles('SUPER_ADMIN')
  removeImage(@CurrentUser() user: RequestUser, @Param('imageId') imageId: string) {
    return this.productsService.removeImage(this.actor(user), imageId);
  }

  private actor(user: RequestUser): ProductActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}

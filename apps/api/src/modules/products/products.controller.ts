import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { MAX_PUBLIC_IMAGE_BYTES } from '../media/media-storage-provider.interface';
import type { PublicImageFile } from '../media/media-storage-provider.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { ReorderProductImagesDto } from './dto/reorder-product-images.dto';
import { SetProductStatusDto } from './dto/set-product-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PUBLIC_IMAGE_BYTES } }))
  uploadImage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: PublicImageFile,
    @Body('altText') altText?: string,
  ) {
    return this.productsService.uploadImage(this.actor(user), id, file, altText);
  }

  @Patch('images/reorder')
  @Roles('SUPER_ADMIN')
  reorderImages(@CurrentUser() user: RequestUser, @Body() dto: ReorderProductImagesDto) {
    return this.productsService.reorderImages(this.actor(user), dto);
  }

  @Patch('images/:imageId/primary')
  @Roles('SUPER_ADMIN')
  setPrimaryImage(@CurrentUser() user: RequestUser, @Param('imageId') imageId: string) {
    return this.productsService.setPrimaryImage(this.actor(user), imageId);
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

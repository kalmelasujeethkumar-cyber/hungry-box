import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BranchScope } from '../../common/decorators/branch-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { MAX_PUBLIC_IMAGE_BYTES } from '../media/media-storage-provider.interface';
import type { PublicImageFile } from '../media/media-storage-provider.interface';
import { BranchProductImagesService } from './branch-product-images.service';
import { BranchProductActor, BranchProductsService } from './branch-products.service';
import { CreateBranchProductDto } from './dto/create-branch-product.dto';
import { ReorderBranchProductImagesDto } from './dto/reorder-branch-product-images.dto';
import { UpdateBranchProductDto } from './dto/update-branch-product.dto';

@Controller('branch-products')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
export class BranchProductsController {
  constructor(
    private readonly branchProducts: BranchProductsService,
    private readonly branchProductImages: BranchProductImagesService,
  ) {}

  @Get()
  @BranchScope('branchId')
  list(@Query('branchId') branchId: string) {
    return this.branchProducts.listForBranch(branchId);
  }

  @Post()
  @BranchScope('branchId')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBranchProductDto) {
    return this.branchProducts.create(this.actor(user), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchProductDto,
  ) {
    return this.branchProducts.update(this.actor(user), id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.branchProducts.remove(this.actor(user), id);
  }

  /**
   * Branch-owned media. Roles are repeated on the method so the authorization
   * surface is explicit and assertable, never inheriting by accident. The branch is
   * always derived from the stored branch product, so a manager cannot reach another
   * branch by crafting the path.
   */
  @Post(':id/images')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PUBLIC_IMAGE_BYTES } }))
  uploadImage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: PublicImageFile,
    @Body('altText') altText?: string,
  ) {
    return this.branchProductImages.upload(this.actor(user), id, file, altText);
  }

  @Patch('images/reorder')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  reorderImages(@CurrentUser() user: RequestUser, @Body() dto: ReorderBranchProductImagesDto) {
    return this.branchProductImages.reorder(this.actor(user), dto);
  }

  @Patch('images/:imageId/primary')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  setPrimaryImage(@CurrentUser() user: RequestUser, @Param('imageId') imageId: string) {
    return this.branchProductImages.setPrimary(this.actor(user), imageId);
  }

  @Delete('images/:imageId')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  removeImage(@CurrentUser() user: RequestUser, @Param('imageId') imageId: string) {
    return this.branchProductImages.remove(this.actor(user), imageId);
  }

  private actor(user: RequestUser): BranchProductActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}

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
import { CategoriesService, CategoryActor } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list() {
    return this.categoriesService.list();
  }

  @Get('admin')
  @Roles('SUPER_ADMIN')
  listAdmin() {
    return this.categoriesService.listAdmin();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(this.actor(user), dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(this.actor(user), id, dto);
  }

  @Post(':id/image')
  @Roles('SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PUBLIC_IMAGE_BYTES } }))
  uploadImage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: PublicImageFile,
  ) {
    return this.categoriesService.uploadImage(this.actor(user), id, file);
  }

  @Delete(':id/image')
  @Roles('SUPER_ADMIN')
  removeImage(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.categoriesService.removeImage(this.actor(user), id);
  }

  private actor(user: RequestUser): CategoryActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}

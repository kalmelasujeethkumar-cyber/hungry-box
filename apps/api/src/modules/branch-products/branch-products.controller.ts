import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BranchScope } from '../../common/decorators/branch-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { BranchProductActor, BranchProductsService } from './branch-products.service';
import { CreateBranchProductDto } from './dto/create-branch-product.dto';
import { UpdateBranchProductDto } from './dto/update-branch-product.dto';

@Controller('branch-products')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
export class BranchProductsController {
  constructor(private readonly branchProducts: BranchProductsService) {}

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

  private actor(user: RequestUser): BranchProductActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BranchScope } from '../../common/decorators/branch-scope.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BranchProductsService } from './branch-products.service';
import { CreateBranchProductDto } from './dto/create-branch-product.dto';

@Controller('branch-products')
export class BranchProductsController {
  constructor(private readonly branchProductsService: BranchProductsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @BranchScope('branchId')
  list(@Query('branchId') branchId: string) {
    return this.branchProductsService.listForBranch(branchId);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @BranchScope('branchId')
  create(@Body() dto: CreateBranchProductDto) {
    return this.branchProductsService.create(dto);
  }
}

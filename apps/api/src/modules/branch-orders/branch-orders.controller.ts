import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { BranchActor, BranchOrdersService } from './branch-orders.service';
import { BranchOrderCancelDto } from './dto/branch-order-cancel.dto';
import { BranchOrderListQueryDto } from './dto/branch-order-list-query.dto';
import { BranchOrderStatusDto } from './dto/branch-order-status.dto';

@Controller('branch/orders')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
export class BranchOrdersController {
  constructor(private readonly branchOrders: BranchOrdersService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: BranchOrderListQueryDto) {
    return this.branchOrders.list(this.actor(user), query);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.branchOrders.get(this.actor(user), id);
  }

  @Post(':id/status')
  status(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: BranchOrderStatusDto,
  ) {
    return this.branchOrders.advanceStatus(this.actor(user), id, dto);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: BranchOrderCancelDto,
  ) {
    return this.branchOrders.cancel(this.actor(user), id, dto);
  }

  private actor(user: RequestUser): BranchActor {
    return { role: user.role, branchId: user.branchId };
  }
}

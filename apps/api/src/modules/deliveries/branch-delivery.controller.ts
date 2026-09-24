import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { AssignOrderDto } from './dto/assign-order.dto';
import { BranchAssignmentListQueryDto } from './dto/branch-assignment-list-query.dto';
import { CancelAssignmentDto } from './dto/cancel-assignment.dto';
import type { DeliveryStaffActor } from './delivery-assignment.service';
import { DeliveryAssignmentService } from './delivery-assignment.service';

@Controller('branch')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
export class BranchDeliveryController {
  constructor(private readonly assignments: DeliveryAssignmentService) {}

  @Get('assignments')
  list(@CurrentUser() user: RequestUser, @Query() query: BranchAssignmentListQueryDto) {
    return this.assignments.list(this.actor(user), query);
  }

  @Post('orders/:orderId/assign')
  assign(
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
    @Body() dto: AssignOrderDto,
  ) {
    return this.assignments.assign(this.actor(user), orderId, dto);
  }

  @Post('orders/:orderId/assignments/:assignmentId/cancel')
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: CancelAssignmentDto,
  ) {
    return this.assignments.cancel(this.actor(user), orderId, assignmentId, dto);
  }

  private actor(user: RequestUser): DeliveryStaffActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}
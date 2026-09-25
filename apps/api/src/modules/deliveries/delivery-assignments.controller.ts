import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsEnum, IsOptional } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import type { DeliveryAssignmentStatus } from '@hungrybox/shared';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { DeliverAssignmentDto } from './dto/deliver-assignment.dto';
import { RejectAssignmentDto } from './dto/reject-assignment.dto';

class MyAssignmentsQueryDto {
  @IsOptional()
  @IsEnum([
    'ASSIGNED',
    'ACCEPTED',
    'PICKED_UP',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'REJECTED',
    'CANCELLED',
  ] as const)
  status?: DeliveryAssignmentStatus;
}

@Controller('delivery/assignments')
@Roles('DELIVERY_PARTNER')
export class DeliveryAssignmentsController {
  constructor(private readonly assignments: DeliveryAssignmentService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: MyAssignmentsQueryDto) {
    return this.assignments.myAssignments(user.sub, query.status);
  }

  @Get(':assignmentId')
  get(@CurrentUser() user: RequestUser, @Param('assignmentId') assignmentId: string) {
    return this.assignments.getOwn(user.sub, assignmentId);
  }

  @Post(':assignmentId/accept')
  accept(@CurrentUser() user: RequestUser, @Param('assignmentId') assignmentId: string) {
    return this.assignments.accept(user.sub, assignmentId);
  }

  @Post(':assignmentId/reject')
  reject(
    @CurrentUser() user: RequestUser,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: RejectAssignmentDto,
  ) {
    return this.assignments.reject(user.sub, assignmentId, dto);
  }

  @Post(':assignmentId/pickup')
  pickup(@CurrentUser() user: RequestUser, @Param('assignmentId') assignmentId: string) {
    return this.assignments.pickup(user.sub, assignmentId);
  }

  @Post(':assignmentId/out-for-delivery')
  outForDelivery(@CurrentUser() user: RequestUser, @Param('assignmentId') assignmentId: string) {
    return this.assignments.outForDelivery(user.sub, assignmentId);
  }

  @Post(':assignmentId/deliver')
  deliver(
    @CurrentUser() user: RequestUser,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: DeliverAssignmentDto,
  ) {
    return this.assignments.deliver(user.sub, assignmentId, dto);
  }
}
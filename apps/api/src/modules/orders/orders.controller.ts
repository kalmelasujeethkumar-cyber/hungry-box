import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CustomerOrderQueryDto } from './dto/customer-order-query.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@Roles('CUSTOMER')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: CustomerOrderQueryDto) {
    return this.ordersService.myOrders(user.sub, query.status);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ordersService.myOrder(user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancelMine(user.sub, id, dto);
  }
}

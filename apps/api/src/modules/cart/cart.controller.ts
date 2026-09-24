import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartBranchQueryDto } from './dto/cart-branch-query.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('cart')
@Roles('CUSTOMER')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  get(@CurrentUser() user: RequestUser, @Query() query: CartBranchQueryDto) {
    return this.cartService.get(user.sub, query.branchId);
  }

  @Post('items')
  addItem(@CurrentUser() user: RequestUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.sub, dto);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.sub, id, dto);
  }

  @Delete('items/:id')
  removeItem(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cartService.removeItem(user.sub, id);
  }

  @Delete()
  clear(@CurrentUser() user: RequestUser, @Query() query: CartBranchQueryDto) {
    return this.cartService.clear(user.sub, query.branchId);
  }
}

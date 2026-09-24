import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { UserActor, UsersService } from './users.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  list(@Query() query: UserListQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN')
  get(@Param('id') id: string) {
    return this.usersService.findPublicById(id);
  }

  @Post('managers')
  @Roles('SUPER_ADMIN')
  createManager(@CurrentUser() user: RequestUser, @Body() dto: CreateManagerDto) {
    return this.usersService.createManager(this.actor(user), dto);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN')
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.usersService.setUserStatus(this.actor(user), id, dto);
  }

  private actor(user: RequestUser): UserActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}

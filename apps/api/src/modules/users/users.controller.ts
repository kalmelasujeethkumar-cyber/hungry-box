import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  list() {
    return this.usersService.listPublicUsers();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN')
  get(@Param('id') id: string) {
    return this.usersService.findPublicById(id);
  }
}

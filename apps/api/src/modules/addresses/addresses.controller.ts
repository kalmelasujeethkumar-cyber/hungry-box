import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('addresses')
@Roles('CUSTOMER')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.addressesService.listMy(user.sub);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.addressesService.findMine(user.sub, id);
  }

  @Patch(':id/default')
  setDefault(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.addressesService.setDefault(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user.sub, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.addressesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.addressesService.delete(user.sub, id);
  }
}

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { BranchSettingsActor, BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { SetBranchStatusDto } from './dto/set-branch-status.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  list() {
    return this.branchesService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.branchesService.findById(id);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(this.actor(user), id, dto);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN')
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetBranchStatusDto,
  ) {
    return this.branchesService.setStatus(this.actor(user), id, dto);
  }

  private actor(user: RequestUser): BranchSettingsActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}

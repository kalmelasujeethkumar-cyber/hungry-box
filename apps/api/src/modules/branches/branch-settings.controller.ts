import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { BranchScope } from '../../common/decorators/branch-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { BranchSettingsActor, BranchesService } from './branches.service';
import { UpdateBranchSettingsDto } from './dto/update-branch-settings.dto';

@Controller('branch/settings')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
export class BranchSettingsController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @BranchScope('branchId')
  get(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.branches.getSettings(this.actor(user), branchId);
  }

  @Patch()
  @BranchScope('branchId')
  update(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateBranchSettingsDto,
    @Query('branchId') branchId?: string,
  ) {
    return this.branches.updateSettings(this.actor(user), dto, branchId);
  }

  private actor(user: RequestUser): BranchSettingsActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}

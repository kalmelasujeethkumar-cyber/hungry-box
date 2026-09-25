import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { ReviewKycDocumentDto } from './dto/review-kyc-document.dto';
import type { KycActor } from './kyc.service';
import { KycService } from './kyc.service';

@Controller('branch/kyc')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
export class BranchKycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.kyc.list(this.actor(user), branchId);
  }

  @Get(':partnerId')
  get(@CurrentUser() user: RequestUser, @Param('partnerId') partnerId: string) {
    return this.kyc.get(this.actor(user), partnerId);
  }

  @Post(':partnerId/documents/:type/access')
  access(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Param('type') type: string,
  ) {
    return this.kyc.getDocumentAccess(this.actor(user), partnerId, type);
  }

  @Post(':partnerId/documents/:type/review')
  @Roles('BRANCH_MANAGER')
  review(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Param('type') type: string,
    @Body() dto: ReviewKycDocumentDto,
  ) {
    return this.kyc.reviewDocument(this.actor(user), partnerId, type, dto);
  }

  private actor(user: RequestUser): KycActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}
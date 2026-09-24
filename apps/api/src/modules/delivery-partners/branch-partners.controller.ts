import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto';
import { PartnerListQueryDto } from './dto/partner-list-query.dto';
import { ReviewPartnerDocumentDto } from './dto/review-partner-document.dto';
import { SetDeliveryPartnerStatusDto } from './dto/set-delivery-partner-status.dto';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto';
import { UpsertPartnerDocumentDto } from './dto/upsert-partner-document.dto';
import { VerifyDeliveryPartnerDto } from './dto/verify-delivery-partner.dto';
import type { PartnerActor } from './delivery-partner.service';
import { DeliveryPartnerService } from './delivery-partner.service';

@Controller('branch/partners')
@Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
export class BranchPartnersController {
  constructor(private readonly partners: DeliveryPartnerService) {}

  @Get('candidates')
  candidates(
    @CurrentUser() user: RequestUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.partners.listCandidates(this.actor(user), branchId);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: PartnerListQueryDto) {
    return this.partners.list(this.actor(user), query);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDeliveryPartnerDto) {
    return this.partners.create(this.actor(user), dto);
  }

  @Get(':partnerId')
  get(@CurrentUser() user: RequestUser, @Param('partnerId') partnerId: string) {
    return this.partners.get(this.actor(user), partnerId);
  }

  @Patch(':partnerId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Body() dto: UpdateDeliveryPartnerDto,
  ) {
    return this.partners.update(this.actor(user), partnerId, dto);
  }

  @Post(':partnerId/status')
  status(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Body() dto: SetDeliveryPartnerStatusDto,
  ) {
    return this.partners.setAccountStatus(this.actor(user), partnerId, dto);
  }

  @Post(':partnerId/verify')
  verify(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Body() dto: VerifyDeliveryPartnerDto,
  ) {
    return this.partners.review(this.actor(user), partnerId, dto);
  }

  @Post(':partnerId/documents')
  upsertDocument(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Body() dto: UpsertPartnerDocumentDto,
  ) {
    return this.partners.upsertDocument(this.actor(user), partnerId, dto);
  }

  @Post(':partnerId/documents/:documentId/review')
  reviewDocument(
    @CurrentUser() user: RequestUser,
    @Param('partnerId') partnerId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewPartnerDocumentDto,
  ) {
    return this.partners.reviewDocument(this.actor(user), partnerId, documentId, dto);
  }

  private actor(user: RequestUser): PartnerActor {
    return { role: user.role, branchId: user.branchId, userId: user.sub };
  }
}
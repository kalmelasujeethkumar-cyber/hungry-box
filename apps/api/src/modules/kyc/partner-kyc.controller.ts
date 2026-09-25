import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AllowInactiveDeliveryPartner } from '../../common/decorators/allow-inactive-delivery-partner.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { MAX_PRIVATE_DOCUMENT_BYTES } from '../media/private-document-storage.interface';
import type { PrivateDocumentFile } from '../media/private-document-storage.interface';
import { KycService } from './kyc.service';

@Controller('delivery/kyc')
@Roles('DELIVERY_PARTNER')
export class PartnerKycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @AllowInactiveDeliveryPartner()
  status(@CurrentUser() user: RequestUser) {
    return this.kyc.getMyKyc(user.sub);
  }

  @Post('documents')
  @AllowInactiveDeliveryPartner()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PRIVATE_DOCUMENT_BYTES } }),
  )
  upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: PrivateDocumentFile,
    @Body('type') type?: string,
  ) {
    if (!type) {
      throw new BadRequestException('A KYC document type is required');
    }
    return this.kyc.uploadMyDocument(user.sub, type, file);
  }

  @Post('documents/:type/access')
  @AllowInactiveDeliveryPartner()
  access(@CurrentUser() user: RequestUser, @Param('type') type: string) {
    return this.kyc.getMyDocumentAccess(user.sub, type);
  }
}
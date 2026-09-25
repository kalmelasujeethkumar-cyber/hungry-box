import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrivateDocumentStorageModule } from '../media/private-document-storage.module';
import { BranchKycController } from './branch-kyc.controller';
import { KycService } from './kyc.service';
import { PartnerKycController } from './partner-kyc.controller';

@Module({
  imports: [AuditModule, PrivateDocumentStorageModule],
  controllers: [PartnerKycController, BranchKycController],
  providers: [KycService],
})
export class KycModule {}
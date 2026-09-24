import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BranchSettingsController } from './branch-settings.controller';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [AuditModule],
  controllers: [BranchesController, BranchSettingsController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}

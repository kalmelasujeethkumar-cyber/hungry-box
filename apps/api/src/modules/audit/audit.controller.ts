import { Controller, Get, Header, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { AuditService } from './audit.service';
import { AuditListQueryDto } from './dto/audit-list-query.dto';

@Controller('branch/audit')
@Roles('BRANCH_MANAGER', 'SUPER_ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: AuditListQueryDto) {
    return this.audit.list({ role: user.role, branchId: user.branchId }, query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-events.csv"')
  export(@CurrentUser() user: RequestUser, @Query() query: AuditListQueryDto) {
    return this.audit.exportCsv({ role: user.role, branchId: user.branchId }, query);
  }
}

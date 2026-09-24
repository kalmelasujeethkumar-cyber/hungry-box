import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { AdminDashboardQueryDto } from './dto/admin-dashboard-query.dto';
import { AdminReportQueryDto } from './dto/admin-report-query.dto';

@Controller('admin')
@Roles('SUPER_ADMIN')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@Query() query: AdminDashboardQueryDto) {
    return this.analytics.dashboard(query);
  }

  @Get('reports/orders')
  async ordersReport(
    @Query() query: AdminReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.analytics.ordersReportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders-report.csv"');
    return csv;
  }
}

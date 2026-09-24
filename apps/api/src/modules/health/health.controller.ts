import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthReport } from '@hungrybox/shared';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async getHealth(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.healthService.report();
    if (report.status !== 'ok') {
      res.status(503);
    }
    return report;
  }
}

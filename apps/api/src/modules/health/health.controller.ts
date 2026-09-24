import { Controller, Get } from '@nestjs/common';
import type { HealthReport } from '@hungrybox/shared';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getHealth(): Promise<HealthReport> {
    return this.healthService.report();
  }
}

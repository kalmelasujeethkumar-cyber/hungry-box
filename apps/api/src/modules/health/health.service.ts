import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthReport } from '@hungrybox/shared';
import { PrismaService } from '../../prisma/prisma.service';

const DB_TIMEOUT_MS = 2500;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async report(): Promise<HealthReport> {
    const service = this.config.get<string>('SERVICE_NAME', 'hungrybox-api');

    const database = await this.checkDatabase();

    return {
      status: database === 'connected' ? 'ok' : 'degraded',
      service,
      version: '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database,
    };
  }

  private async checkDatabase(): Promise<HealthReport['database']> {
    const client = this.prisma.getClient();
    if (!client) {
      return 'unconfigured';
    }
    try {
      await withTimeout(client.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
      return 'connected';
    } catch {
      return 'unreachable';
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Database probe timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

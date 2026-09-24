import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from './health.service';

function buildService(dbStatus: 'null' | 'ok' | 'reject') {
  let client: unknown = null;
  if (dbStatus === 'ok' || dbStatus === 'reject') {
    const queryRaw =
      dbStatus === 'ok'
        ? vi.fn().mockResolvedValue([{ '?column?': 1 }])
        : vi.fn().mockRejectedValue(new Error('boom'));
    client = { $queryRaw: queryRaw };
  }
  const prisma = {
    getClient: vi.fn().mockReturnValue(client),
  } as unknown as PrismaService;
  const config = {
    get: (key: string, fallback?: string) => (key === 'SERVICE_NAME' ? fallback : undefined),
  } as unknown as ConfigService;
  return new HealthService(prisma, config);
}

describe('HealthService.report', () => {
  it('reports ok when the database responds', async () => {
    const report = await buildService('ok').report();
    expect(report.status).toBe('ok');
    expect(report.database).toBe('connected');
  });

  it('reports degraded when the database is unreachable', async () => {
    const report = await buildService('reject').report();
    expect(report.status).toBe('degraded');
    expect(report.database).toBe('unreachable');
  });

  it('reports degraded when the database is unconfigured', async () => {
    const report = await buildService('null').report();
    expect(report.status).toBe('degraded');
    expect(report.database).toBe('unconfigured');
  });
});

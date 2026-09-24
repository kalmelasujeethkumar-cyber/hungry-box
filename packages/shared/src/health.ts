export type HealthDatabaseStatus = 'unconfigured' | 'connected' | 'unreachable';

export type HealthStatus = 'ok' | 'degraded';

export interface HealthReport {
  status: HealthStatus;
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  database: HealthDatabaseStatus;
}

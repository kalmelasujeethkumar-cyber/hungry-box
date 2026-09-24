export type HealthDatabaseStatus = 'unconfigured' | 'connected' | 'unreachable';

export interface HealthReport {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  database: HealthDatabaseStatus;
}

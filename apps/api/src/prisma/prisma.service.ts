import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient | null;

  constructor(config: ConfigService) {
    const databaseUrl = config.get<string>('DATABASE_URL');
    this.client = databaseUrl
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
      : null;
  }

  getClient(): PrismaClient | null {
    return this.client;
  }

  requireClient(): PrismaClient {
    if (!this.client) {
      throw new ServiceUnavailableException('Database is not configured');
    }
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) {
      this.logger.log('Disconnecting Prisma client');
      await this.client.$disconnect();
    }
  }
}

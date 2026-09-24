import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';

type SequenceClient = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class OrderNumberService {
  async next(client: SequenceClient): Promise<string> {
    const dateKey = this.todayKey();
    const counter = await client.orderNumberCounter.upsert({
      where: { date: dateKey },
      update: { seq: { increment: 1 } },
      create: { date: dateKey },
    });
    return `HB-${dateKey}-${String(counter.seq).padStart(6, '0')}`;
  }

  todayKey(): string {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
}

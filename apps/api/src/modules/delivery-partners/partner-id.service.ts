import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';

type SequenceClient = PrismaClient | Prisma.TransactionClient;

const COUNTER_ID = 'partner';

@Injectable()
export class PartnerIdService {
  /** Next sequential partner id, e.g. "HB-DP-000042". */
  async next(client: SequenceClient): Promise<string> {
    const counter = await client.partnerIdCounter.upsert({
      where: { id: COUNTER_ID },
      update: { seq: { increment: 1 } },
      create: { id: COUNTER_ID },
    });
    return `HB-DP-${String(counter.seq).padStart(6, '0')}`;
  }
}
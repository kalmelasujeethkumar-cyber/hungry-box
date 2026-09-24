import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorRole: string;
  actorId?: string | null;
  kind: string;
  entityType: string;
  entityId?: string | null;
  message?: string | null;
}

export type AuditTargetClient = PrismaClient | Prisma.TransactionClient;

export const AuditKinds = {
  ORDER_CREATED: 'ORDER_CREATED',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  CHECKOUT_CONFLICT: 'CHECKOUT_CONFLICT',
  IDEMPOTENCY_REPLAY: 'IDEMPOTENCY_REPLAY',
  PARTNER_CREATED: 'PARTNER_CREATED',
  PARTNER_STATUS_CHANGED: 'PARTNER_STATUS_CHANGED',
  PARTNER_AVAILABILITY_CHANGED: 'PARTNER_AVAILABILITY_CHANGED',
  PARTNER_VERIFIED: 'PARTNER_VERIFIED',
  DOCUMENT_REVIEWED: 'DOCUMENT_REVIEWED',
  DELIVERY_ASSIGNED: 'DELIVERY_ASSIGNED',
  DELIVERY_ACCEPTED: 'DELIVERY_ACCEPTED',
  DELIVERY_REJECTED: 'DELIVERY_REJECTED',
  DELIVERY_CANCELLED: 'DELIVERY_CANCELLED',
  DELIVERY_PICKED_UP: 'DELIVERY_PICKED_UP',
  DELIVERY_OUT_FOR_DELIVERY: 'DELIVERY_OUT_FOR_DELIVERY',
  DELIVERY_COMPLETED: 'DELIVERY_COMPLETED',
  DELIVERY_LOCATION_UPDATED: 'DELIVERY_LOCATION_UPDATED',
} as const;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: AuditEntry,
    client: AuditTargetClient = this.prisma.requireClient(),
  ): Promise<void> {
    await client.auditEvent.create({
      data: {
        actorRole: entry.actorRole,
        actorId: entry.actorId ?? null,
        kind: entry.kind,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        message: entry.message ?? null,
      },
    });
  }
}

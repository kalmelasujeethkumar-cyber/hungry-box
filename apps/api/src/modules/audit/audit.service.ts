import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuditListQuery, AuditListResultDto, UserRole } from '@hungrybox/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorRole: string;
  actorId?: string | null;
  kind: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  message?: string | null;
}

export interface AuditActor {
  role: UserRole;
  branchId: string | null;
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
  BRANCH_PRODUCT_CREATED: 'BRANCH_PRODUCT_CREATED',
  BRANCH_PRODUCT_UPDATED: 'BRANCH_PRODUCT_UPDATED',
  BRANCH_PRODUCT_DEACTIVATED: 'BRANCH_PRODUCT_DEACTIVATED',
  BRANCH_SETTINGS_UPDATED: 'BRANCH_SETTINGS_UPDATED',
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
  COD_ORDER_CREATED: 'COD_ORDER_CREATED',
  COD_COLLECTED: 'COD_COLLECTED',
  COD_COLLECTION_CORRECTED: 'COD_COLLECTION_CORRECTED',
  COD_COLLECTION_FAILED: 'COD_COLLECTION_FAILED',
  BRANCH_UPDATED: 'BRANCH_UPDATED',
  BRANCH_STATUS_CHANGED: 'BRANCH_STATUS_CHANGED',
  USER_CREATED: 'USER_CREATED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_STATUS_CHANGED: 'PRODUCT_STATUS_CHANGED',
  PRODUCT_IMAGE_ADDED: 'PRODUCT_IMAGE_ADDED',
  PRODUCT_IMAGE_UPDATED: 'PRODUCT_IMAGE_UPDATED',
  PRODUCT_IMAGE_REMOVED: 'PRODUCT_IMAGE_REMOVED',
  PRODUCT_IMAGE_UPLOADED: 'PRODUCT_IMAGE_UPLOADED',
  PRODUCT_IMAGE_PRIMARY_CHANGED: 'PRODUCT_IMAGE_PRIMARY_CHANGED',
  PRODUCT_IMAGES_REORDERED: 'PRODUCT_IMAGES_REORDERED',
  CATEGORY_IMAGE_UPLOADED: 'CATEGORY_IMAGE_UPLOADED',
  CATEGORY_IMAGE_REPLACED: 'CATEGORY_IMAGE_REPLACED',
  CATEGORY_IMAGE_REMOVED: 'CATEGORY_IMAGE_REMOVED',
  MEDIA_CLEANUP_FAILED: 'MEDIA_CLEANUP_FAILED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_STATUS_CHANGED: 'CATEGORY_STATUS_CHANGED',
} as const;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const auditEventSelect = {
  id: true,
  actorRole: true,
  actorId: true,
  kind: true,
  entityType: true,
  entityId: true,
  branchId: true,
  message: true,
  createdAt: true,
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
        branchId: entry.branchId ?? null,
        message: entry.message ?? null,
      },
    });
  }

  /** Branch-scoped audit read. Managers are pinned to their own branch. */
  async list(actor: AuditActor, query: AuditListQuery): Promise<AuditListResultDto> {
    const db = this.prisma.requireClient();
    const where = this.buildWhere(actor, query);

    const [rows, total] = await Promise.all([
      db.auditEvent.findMany({
        where,
        select: auditEventSelect,
        orderBy: { createdAt: 'desc' },
        skip: this.skip(query),
        take: this.take(query),
      }),
      db.auditEvent.count({ where }),
    ]);

    return {
      items: rows.map(toAuditEventDto),
      total,
      page: this.page(query),
      limit: this.limit(query),
    };
  }

  /** CSV representation of the same branch-scoped query. */
  async exportCsv(actor: AuditActor, query: AuditListQuery): Promise<string> {
    const db = this.prisma.requireClient();
    const where = this.buildWhere(actor, query);
    const rows = await db.auditEvent.findMany({
      where,
      select: auditEventSelect,
      orderBy: { createdAt: 'desc' },
      take: MAX_LIMIT,
    });
    return toCsv(rows);
  }

  /**
   * Branch scoping is authoritative here: a BRANCH_MANAGER sees only their own
   * branch's events. Any client-supplied branchId is ignored for managers, so a
   * cross-branch read can never leak events.
   */
  private buildWhere(actor: AuditActor, query: AuditListQuery): Prisma.AuditEventWhereInput {
    const where: Prisma.AuditEventWhereInput = {};

    const enforcedBranchId = this.enforcedBranchId(actor);
    if (enforcedBranchId !== null) {
      where.branchId = enforcedBranchId;
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.kind) {
      where.kind = query.kind;
    }
    if (query.entityType) {
      where.entityType = query.entityType;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    return where;
  }

  private enforcedBranchId(actor: AuditActor): string | null {
    if (actor.role === 'BRANCH_MANAGER') {
      if (!actor.branchId) {
        throw new ForbiddenException('Branch manager has no assigned branch');
      }
      return actor.branchId;
    }
    return null;
  }

  private page(query: AuditListQuery): number {
    const page = Number(query.page);
    return Number.isInteger(page) && page >= 1 ? page : DEFAULT_PAGE;
  }

  private limit(query: AuditListQuery): number {
    const limit = Number(query.limit);
    if (Number.isInteger(limit) && limit >= 1) {
      return Math.min(limit, MAX_LIMIT);
    }
    return DEFAULT_LIMIT;
  }

  private skip(query: AuditListQuery): number {
    return (this.page(query) - 1) * this.limit(query);
  }

  private take(query: AuditListQuery): number {
    return this.limit(query);
  }
}

function toAuditEventDto(row: {
  id: string;
  actorRole: string;
  actorId: string | null;
  kind: string;
  entityType: string;
  entityId: string | null;
  branchId: string | null;
  message: string | null;
  createdAt: Date;
}): AuditListResultDto['items'][number] {
  return {
    id: row.id,
    actorRole: row.actorRole,
    actorId: row.actorId,
    kind: row.kind,
    entityType: row.entityType,
    entityId: row.entityId,
    branchId: row.branchId,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(
  rows: ReadonlyArray<{
    id: string;
    actorRole: string;
    actorId: string | null;
    kind: string;
    entityType: string;
    entityId: string | null;
    branchId: string | null;
    message: string | null;
    createdAt: Date;
  }>,
): string {
  const header = [
    'id',
    'createdAt',
    'actorRole',
    'actorId',
    'kind',
    'entityType',
    'entityId',
    'branchId',
    'message',
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      row.actorRole,
      row.actorId,
      row.kind,
      row.entityType,
      row.entityId,
      row.branchId,
      row.message,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\n');
}

import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

const MANAGER = { role: 'BRANCH_MANAGER' as const, branchId: 'b1' };
const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null };

function buildService(db: Record<string, unknown>) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const service = new AuditService(prisma);
  return { service, db };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    actorRole: 'SUPER_ADMIN',
    actorId: 'u-admin',
    kind: 'ORDER_STATUS_CHANGED',
    entityType: 'Order',
    entityId: 'o1',
    branchId: 'b1',
    message: 'Order status changed PLACED -> CONFIRMED',
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    ...overrides,
  };
}

describe('AuditService.record', () => {
  it('persists a nullable branchId', async () => {
    const db = { auditEvent: { create: vi.fn().mockResolvedValue({}) } };
    const { service } = buildService(db);

    await service.record({ actorRole: 'CUSTOMER', kind: 'X', entityType: 'Order', entityId: 'o1' });

    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branchId: null }),
    });
  });
});

describe('AuditService.list', () => {
  it('pins a branch manager to their own branch regardless of query', async () => {
    const db = {
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([eventRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const { service } = buildService(db);

    const result = await service.list(MANAGER, { branchId: 'b2', page: 2, limit: 50 });

    expect(db.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b1' }) }),
    );
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it('lets a super admin filter by an arbitrary branch', async () => {
    const db = {
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const { service } = buildService(db);

    const result = await service.list(SUPER_ADMIN, { branchId: 'b2', page: 0, limit: 1000 });

    expect(db.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b2' }) }),
    );

    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
  });

  it('rejects a manager without an assigned branch', async () => {
    const { service } = buildService({});

    await expect(service.list({ role: 'BRANCH_MANAGER', branchId: null }, {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('applies kind, entityType and date filters with pagination', async () => {
    const db = {
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([eventRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const { service } = buildService(db);

    await service.list(SUPER_ADMIN, {
      kind: 'ORDER_CREATED',
      entityType: 'Order',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
      page: 3,
      limit: 10,
    });

    const where = db.auditEvent.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      kind: 'ORDER_CREATED',
      entityType: 'Order',
      createdAt: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    const findManyCall = db.auditEvent.findMany.mock.calls[0]?.[0];
    expect(findManyCall.skip).toBe(20);
    expect(findManyCall.take).toBe(10);
  });
});

describe('AuditService.exportCsv', () => {
  it('exports a CSV with headers and escaped cells', async () => {
    const db = {
      auditEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            eventRow({ message: 'Order "cancelled", now', kind: 'ORDER_CANCELLED' }),
          ]),
      },
    };
    const { service } = buildService(db);

    const csv = await service.exportCsv(MANAGER, {});

    expect(csv).toContain(
      'id,createdAt,actorRole,actorId,kind,entityType,entityId,branchId,message',
    );
    expect(csv).toContain('"Order ""cancelled"", now"');
  });

  it('scopes the export to the managers own branch', async () => {
    const db = {
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const { service } = buildService(db);

    await service.exportCsv(MANAGER, { branchId: 'b2' });

    expect(db.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b1' }) }),
    );
  });
});

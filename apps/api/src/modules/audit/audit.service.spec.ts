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

  it('expands a bare calendar date to the whole business day', async () => {
    const db = {
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const { service } = buildService(db);

    await service.list(SUPER_ADMIN, { from: '2026-09-24', to: '2026-09-24' });

    // A bare YYYY-MM-DD is parsed as UTC midnight, which is 05:30 IST. Comparing against
    // that raw instant silently dropped the first 5h30m of the day and everything after
    // 05:30, so both edges are expanded in business time instead.
    expect(db.auditEvent.findMany.mock.calls[0]?.[0]?.where.createdAt).toEqual({
      gte: new Date('2026-09-23T18:30:00.000Z'),
      lte: new Date('2026-09-24T18:29:59.999Z'),
    });
  });
});

describe('AuditService.exportCsv', () => {
  it('exports a deliberate column order with escaped cells', async () => {
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

    expect(csv.split('\n')[0]).toBe(
      'id,createdAtIst,actorRole,actorId,kind,entityType,entityId,branchId,message',
    );
    expect(csv).toContain('"Order ""cancelled"", now"');
  });

  it('stamps rows in business time', async () => {
    const db = {
      auditEvent: { findMany: vi.fn().mockResolvedValue([eventRow()]) },
    };
    const { service } = buildService(db);

    const csv = await service.exportCsv(MANAGER, {});

    // 10:00Z is 15:30 IST on 24 Sep.
    expect(csv).toContain('evt-1,2026-09-24 15:30:00 +05:30,SUPER_ADMIN');
  });

  it('orders newest-first with a deterministic tiebreak', async () => {
    const findMany = vi.fn().mockResolvedValue([eventRow()]);
    const { service } = buildService({ auditEvent: { findMany } });

    await service.exportCsv(MANAGER, {});

    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('reads every matching event instead of stopping at the page-size limit', async () => {
    const total = 2500;
    const findMany = vi.fn().mockImplementation(({ skip, take }: { skip: number; take: number }) =>
      Promise.resolve(
        Array.from({ length: Math.min(take, total - skip) }, (_, i) =>
          eventRow({ id: `evt-${skip + i}` }),
        ),
      ),
    );
    const { service } = buildService({ auditEvent: { findMany } });

    const csv = await service.exportCsv(MANAGER, {});

    // Header plus every one of the 2500 events: nothing is dropped.
    expect(csv.split('\n')).toHaveLength(total + 1);
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(findMany.mock.calls.map((c) => c[0].skip)).toEqual([0, 1000, 2000]);
    // The page-size constant must no longer cap an export.
    expect(findMany.mock.calls[0][0].take).toBe(1000);
  });

  it('neutralises spreadsheet formula injection in free-text messages', async () => {
    const db = {
      auditEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            eventRow({ message: '=HYPERLINK("http://evil","click"),note' }),
            eventRow({ id: 'evt-2', message: '-2+3+cmd|\' /C calc\'!A1' }),
          ]),
      },
    };
    const { service } = buildService(db);

    const csv = await service.exportCsv(MANAGER, {});

    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click""),note"`);
    // This payload contains no comma, quote or newline, so it needs no RFC 4180 quoting;
    // only the text-marker apostrophe is added.
    expect(csv).toContain(`'-2+3+cmd|' /C calc'!A1`);
  });

  it('leaves an ordinary message untouched', async () => {
    const db = {
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([eventRow({ message: 'Partner KYC verified' })]),
      },
    };
    const { service } = buildService(db);

    const csv = await service.exportCsv(MANAGER, {});

    expect(csv).toContain('Partner KYC verified');
    expect(csv).not.toContain("'Partner");
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

  it('emits a header-only document when nothing matches', async () => {
    const db = { auditEvent: { findMany: vi.fn().mockResolvedValue([]) } };
    const { service } = buildService(db);

    const csv = await service.exportCsv(MANAGER, {});

    expect(csv).toBe(
      'id,createdAtIst,actorRole,actorId,kind,entityType,entityId,branchId,message',
    );
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';

const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

function buildService<T extends Record<string, unknown>>(db: T) {
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new UsersService(prisma, audit);
  return { service, db, audit };
}

function managerRow() {
  return {
    id: 'u-1',
    loginId: 'manager@guntur.in',
    email: null,
    name: 'Branch Manager One',
    role: 'BRANCH_MANAGER',
    status: 'ACTIVE',
    branchId: 'b1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    branch: { name: 'Hungry Box Guntur' },
  };
}

describe('UsersService.createManager', () => {
  it('creates an ACTIVE manager with a hashed temporary password and audits USER_CREATED', async () => {
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
          ...managerRow(),
          loginId: args.data.loginId,
          passwordHash: args.data.passwordHash,
        })),
      },
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', name: 'Hungry Box Guntur' }) },
    };
    const db = { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
    const { service, audit } = buildService(db);

    const result = await service.createManager(SUPER_ADMIN, {
      name: 'Branch Manager One',
      loginId: 'manager@guntur.in',
      branchId: 'b1',
    });

    expect(result.manager.status).toBe('ACTIVE');
    expect(result.manager.branchName).toBe('Hungry Box Guntur');
    expect(result.temporaryPassword).toBeTruthy();
    const passwordHash = tx.user.create.mock.calls[0][0].data.passwordHash as string;
    expect(passwordHash).not.toBe(result.temporaryPassword);
    expect(passwordHash).toMatch(/^\$argon2/);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.USER_CREATED,
        entityType: 'user',
        branchId: 'b1',
      }),
      expect.anything(),
    );
  });

  it('rejects a login id that is already claimed', async () => {
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'existing' }) },
      branch: { findUnique: vi.fn() },
    };
    const db = { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
    const { service } = buildService(db);

    await expect(
      service.createManager(SUPER_ADMIN, {
        name: 'M',
        loginId: 'taken@guntur.in',
        branchId: 'b1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an unknown branch', async () => {
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      branch: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const db = { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
    const { service } = buildService(db);

    await expect(
      service.createManager(SUPER_ADMIN, { name: 'M', loginId: 'm@x.in', branchId: 'missing' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.setUserStatus', () => {
  it('suspends a manager and audits USER_STATUS_CHANGED', async () => {
    const db = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(managerRow())
          .mockResolvedValueOnce({ ...managerRow(), status: 'SUSPENDED' }),
        update: vi.fn().mockResolvedValue({ ...managerRow(), status: 'SUSPENDED' }),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.setUserStatus(SUPER_ADMIN, 'u-1', { status: 'SUSPENDED' });

    expect(result.status).toBe('SUSPENDED');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.USER_STATUS_CHANGED,
        entityId: 'u-1',
        branchId: 'b1',
      }),
    );
  });

  it('refuses to change a non-manager user', async () => {
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ ...managerRow(), role: 'SUPER_ADMIN' }) },
    };
    const { service } = buildService(db);

    await expect(
      service.setUserStatus(SUPER_ADMIN, 'u-admin', { status: 'INACTIVE' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses to change your own status', async () => {
    const db = { user: { findUnique: vi.fn().mockResolvedValue(managerRow()) } };
    const { service } = buildService(db);

    await expect(
      service.setUserStatus({ role: 'SUPER_ADMIN', branchId: null, userId: 'u-1' }, 'u-1', {
        status: 'INACTIVE',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a no-op status change', async () => {
    const db = { user: { findUnique: vi.fn().mockResolvedValue(managerRow()) } };
    const { service } = buildService(db);

    await expect(service.setUserStatus(SUPER_ADMIN, 'u-1', { status: 'ACTIVE' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException for an unknown user', async () => {
    const db = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { service } = buildService(db);

    await expect(
      service.setUserStatus(SUPER_ADMIN, 'missing', { status: 'INACTIVE' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.listUsers', () => {
  it('filters, paginates, and maps branch names', async () => {
    const db = {
      user: {
        findMany: vi.fn().mockResolvedValue([managerRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const { service } = buildService(db);

    const result = await service.listUsers({ role: 'BRANCH_MANAGER', page: 2, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.items[0].branchName).toBe('Hungry Box Guntur');
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'BRANCH_MANAGER' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('builds a search OR clause and clamps page/limit defaults', async () => {
    const db = {
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const { service } = buildService(db);

    await service.listUsers({ search: '  aman  ' });

    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR).toHaveLength(3);
    const call = db.user.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
    expect(call.take).toBe(25);
  });
});

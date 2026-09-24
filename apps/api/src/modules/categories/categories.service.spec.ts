import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { CategoriesService } from './categories.service';

const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

function buildService<T extends Record<string, unknown>>(db: T) {
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new CategoriesService(prisma, audit);
  return { service, db, audit };
}

function categoryRow(status = 'ACTIVE') {
  return {
    id: 'c1',
    name: 'Biryani & Rice Meals',
    slug: 'biryani-and-rice-meals',
    description: null,
    imageUrl: null,
    status,
    sortOrder: 1,
  };
}

describe('CategoriesService.create', () => {
  it('derives a slug when not supplied and audits CATEGORY_CREATED', async () => {
    const db = { category: { create: vi.fn().mockResolvedValue(categoryRow()) } };
    const { service, audit } = buildService(db);

    const result = await service.create(SUPER_ADMIN, { name: 'Biryani & Rice Meals' });

    expect(result.slug).toBe('biryani-and-rice-meals');
    expect(db.category.create.mock.calls[0][0].data.slug).toBe('biryani-rice-meals');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.CATEGORY_CREATED, entityId: 'c1' }),
    );
  });

  it('rejects a duplicate slug', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const db = { category: { create: vi.fn().mockRejectedValue(error) } };
    const { service } = buildService(db);

    await expect(service.create(SUPER_ADMIN, { name: 'X', slug: 'taken' })).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('CategoriesService.update', () => {
  it('updates fields and audits CATEGORY_UPDATED for non-status changes', async () => {
    const db = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'c1', name: 'Biryani', status: 'ACTIVE' }),
        update: vi.fn().mockResolvedValue(categoryRow()),
        findUniqueOrThrow: vi.fn().mockResolvedValue(categoryRow()),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.update(SUPER_ADMIN, 'c1', { name: 'Biryani Deluxe' });

    expect(result.name).toBe('Biryani & Rice Meals');
    expect(db.category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { name: 'Biryani Deluxe' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.CATEGORY_UPDATED }),
    );
  });

  it('audits CATEGORY_STATUS_CHANGED when the status flips', async () => {
    const db = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'c1', name: 'Biryani', status: 'ACTIVE' }),
        update: vi.fn().mockResolvedValue(categoryRow('INACTIVE')),
        findUniqueOrThrow: vi.fn().mockResolvedValue(categoryRow('INACTIVE')),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.update(SUPER_ADMIN, 'c1', { status: 'INACTIVE' });

    expect(result.status).toBe('INACTIVE');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.CATEGORY_STATUS_CHANGED }),
    );
  });

  it('throws NotFoundException for an unknown category', async () => {
    const db = {
      category: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };
    const { service } = buildService(db);

    await expect(service.update(SUPER_ADMIN, 'missing', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    expect(db.category.update).not.toHaveBeenCalled();
  });
});

describe('CategoriesService.listAdmin', () => {
  it('returns all categories regardless of status', async () => {
    const db = {
      category: {
        findMany: vi.fn().mockResolvedValue([categoryRow('ACTIVE'), categoryRow('INACTIVE')]),
      },
    };
    const { service } = buildService(db);

    const result = await service.listAdmin();

    expect(result).toHaveLength(2);
    expect(db.category.findMany.mock.calls[0][0].where).toBeUndefined();
  });
});

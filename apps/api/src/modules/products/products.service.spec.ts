import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { ProductsService } from './products.service';

const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

function buildService<T extends Record<string, unknown>>(db: T) {
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new ProductsService(prisma, audit);
  return { service, db, audit };
}

function productRow(status: string, images: unknown[] = []) {
  return {
    id: 'p1',
    name: 'Special Chicken Biryani',
    slug: 'special-chicken-biryani',
    description: null,
    status,
    category: { id: 'c1', name: 'Biryani', slug: 'biryani' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    images,
  };
}

describe('ProductsService.update', () => {
  it('updates metadata without touching branch prices', async () => {
    const db = {
      product: {
        findUnique: vi.fn().mockResolvedValue(productRow('ACTIVE')),
        update: vi.fn().mockResolvedValue(productRow('ACTIVE')),
      },
      category: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', status: 'ACTIVE' }) },
      productImage: { updateMany: vi.fn() },
    };
    const { service, audit } = buildService(db);

    const result = await service.update(SUPER_ADMIN, 'p1', { name: 'X', categoryId: 'c1' });

    expect(result.name).toBe('Special Chicken Biryani');
    expect(db.product.update.mock.calls[0][0].data.category).toEqual({ connect: { id: 'c1' } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_UPDATED, entityId: 'p1' }),
    );
  });

  it('disconnects the category when cleared and rejects a duplicate slug', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const db = {
      product: {
        findUnique: vi.fn().mockResolvedValue(productRow('ACTIVE')),
        update: vi.fn().mockRejectedValue(prismaError),
      },
    };
    const { service } = buildService(db);

    await expect(service.update(SUPER_ADMIN, 'p1', { categoryId: null })).rejects.toThrow(
      ConflictException,
    );
    expect(db.product.update.mock.calls[0][0].data.category).toEqual({ disconnect: true });
  });
});

describe('ProductsService.setStatus', () => {
  it('changes product status and audits PRODUCT_STATUS_CHANGED', async () => {
    const db = {
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(productRow('ACTIVE'))
          .mockResolvedValueOnce(productRow('INACTIVE')),
        update: vi.fn().mockResolvedValue(productRow('INACTIVE')),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.setStatus(SUPER_ADMIN, 'p1', { status: 'INACTIVE' });

    expect(result.status).toBe('INACTIVE');
    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'INACTIVE' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_STATUS_CHANGED, entityId: 'p1' }),
    );
  });

  it('rejects a no-op status change', async () => {
    const db = { product: { findUnique: vi.fn().mockResolvedValue(productRow('INACTIVE')) } };
    const { service } = buildService(db);

    await expect(service.setStatus(SUPER_ADMIN, 'p1', { status: 'INACTIVE' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ProductsService.addImage', () => {
  it('marks the first image primary and audits PRODUCT_IMAGE_ADDED', async () => {
    const tx = {
      product: { findUnique: vi.fn().mockResolvedValue({ id: 'p1', name: 'Biryani' }) },
      productImage: {
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: 'img1' }),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: {
        findUnique: vi.fn().mockResolvedValue(
          productRow('ACTIVE', [
            {
              id: 'img1',
              imageUrl: 'https://img.example/biryani.jpg',
              altText: null,
              sortOrder: 0,
              isPrimary: true,
            },
          ]),
        ),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.addImage(SUPER_ADMIN, 'p1', {
      imageUrl: 'https://img.example/biryani.jpg',
    });

    expect(tx.productImage.create.mock.calls[0][0].data.isPrimary).toBe(true);
    expect(result.images[0].isPrimary).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_IMAGE_ADDED, entityId: 'p1' }),
    );
  });
});

describe('ProductsService.removeImage', () => {
  it('promotes the next image when the primary is removed', async () => {
    const tx = {
      productImage: {
        findUnique: vi.fn().mockResolvedValue({ productId: 'p1', isPrimary: true }),
        delete: vi.fn().mockResolvedValue({ id: 'img1' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'img2' }),
        update: vi.fn().mockResolvedValue({ id: 'img2' }),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: {
        findUnique: vi.fn().mockResolvedValue(
          productRow('ACTIVE', [
            {
              id: 'img2',
              imageUrl: 'https://img.example/2.jpg',
              altText: null,
              sortOrder: 1,
              isPrimary: true,
            },
          ]),
        ),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.removeImage(SUPER_ADMIN, 'img1');

    expect(tx.productImage.update).toHaveBeenCalledWith({
      where: { id: 'img2' },
      data: { isPrimary: true },
    });
    expect(result.images[0].isPrimary).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_IMAGE_REMOVED, entityId: 'img1' }),
    );
  });

  it('throws NotFoundException for an unknown image', async () => {
    const tx = { productImage: { findUnique: vi.fn().mockResolvedValue(null) } };
    const db = { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
    const { service } = buildService(db);

    await expect(service.removeImage(SUPER_ADMIN, 'missing')).rejects.toThrow(NotFoundException);
  });
});

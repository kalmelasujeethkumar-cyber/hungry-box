import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import type { MediaStorageProvider } from '../media/media-storage-provider.interface';
import { ProductsService } from './products.service';

const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

function fakeProvider(
  overrides: Partial<Pick<MediaStorageProvider, 'uploadPublicImage' | 'deletePublicImage'>> = {},
) {
  return {
    uploadPublicImage: vi.fn().mockResolvedValue({
      secureUrl: 'https://cdn.example/optimized.jpg',
      publicId: 'public/products/p1/abcd-1234',
      resourceType: 'image',
    }),
    deletePublicImage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildService<T extends Record<string, unknown>>(
  db: T,
  mediaStorage: ReturnType<typeof fakeProvider> = fakeProvider(),
) {
  const prisma = { requireClient: vi.fn().mockReturnValue(db) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new ProductsService(prisma, audit, mediaStorage);
  return { service, db, audit, mediaStorage };
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

function imageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'img1',
    imageUrl: 'https://cdn.example/optimized.jpg',
    altText: null,
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

function pngFile(sizeOffset = 0) {
  return {
    buffer: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(sizeOffset),
    ]),
    mimetype: 'image/png',
    originalname: 'photo.png',
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

describe('ProductsService.uploadImage', () => {
  function uploadDb(count: number, queryRows: unknown[] = [{ id: 'p1' }]) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue(queryRows),
      productImage: {
        count: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockResolvedValue({ id: 'img1', productId: 'p1' }),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: {
        findUnique: vi.fn().mockResolvedValue(productRow('ACTIVE', [imageRow()])),
      },
    };
    return { db, tx };
  }

  it('uploads the first image, marks it primary and audits PRODUCT_IMAGE_UPLOADED', async () => {
    const { db, tx } = uploadDb(0);
    const { service, audit, mediaStorage } = buildService(db);

    const result = await service.uploadImage(SUPER_ADMIN, 'p1', pngFile());

    expect(mediaStorage.uploadPublicImage).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'hungry-box/catalog/products/p1',
        publicId: expect.any(String),
      }),
    );
    expect(tx.productImage.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        productId: 'p1',
        imageUrl: 'https://cdn.example/optimized.jpg',
        providerPublicId: 'public/products/p1/abcd-1234',
        resourceType: 'image',
        isPrimary: true,
        sortOrder: 0,
      }),
    );
    expect(result.images[0].isPrimary).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_IMAGE_UPLOADED, entityId: 'img1' }),
    );
  });

  it('allows up to three images and keeps later images non-primary', async () => {
    const { db, tx } = uploadDb(2);
    const { service } = buildService(db);

    await service.uploadImage(SUPER_ADMIN, 'p1', pngFile());

    expect(tx.productImage.create.mock.calls[0][0].data.isPrimary).toBe(false);
    expect(tx.productImage.create.mock.calls[0][0].data.sortOrder).toBe(2);
  });

  it('rejects a fourth image and deletes the orphaned external asset', async () => {
    const { db } = uploadDb(3);
    const { service, mediaStorage } = buildService(db);

    await expect(service.uploadImage(SUPER_ADMIN, 'p1', pngFile())).rejects.toThrow(
      BadRequestException,
    );
    expect(mediaStorage.deletePublicImage).toHaveBeenCalledWith('public/products/p1/abcd-1234');
  });

  it('throws NotFoundException for a missing product and cleans up the asset', async () => {
    const { db } = uploadDb(0, []);
    const { service, mediaStorage } = buildService(db);

    await expect(service.uploadImage(SUPER_ADMIN, 'p1', pngFile())).rejects.toThrow(
      NotFoundException,
    );
    expect(mediaStorage.deletePublicImage).toHaveBeenCalledWith('public/products/p1/abcd-1234');
  });

  it('audits MEDIA_CLEANUP_FAILED when deleting an orphaned asset fails', async () => {
    const { db } = uploadDb(3);
    const mediaStorage = fakeProvider({
      deletePublicImage: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { service, audit } = buildService(db, mediaStorage);

    await expect(service.uploadImage(SUPER_ADMIN, 'p1', pngFile())).rejects.toThrow(
      BadRequestException,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.MEDIA_CLEANUP_FAILED,
        actorRole: 'SYSTEM',
        entityType: 'product_image',
      }),
    );
  });

  it('rejects an invalid file before any upload happens', async () => {
    const { db } = uploadDb(0);
    const { service, mediaStorage } = buildService(db);

    await expect(
      service.uploadImage(SUPER_ADMIN, 'p1', { buffer: Buffer.from('not-an-image') }),
    ).rejects.toThrow(BadRequestException);
    expect(mediaStorage.uploadPublicImage).not.toHaveBeenCalled();
  });

  it('rejects an oversized file', async () => {
    const { db } = uploadDb(0);
    const { service } = buildService(db);
    const oversized = pngFile(5 * 1024 * 1024 + 1);

    await expect(service.uploadImage(SUPER_ADMIN, 'p1', oversized)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ProductsService.setPrimaryImage', () => {
  it('clears other primaries, sets the target primary and audits it', async () => {
    const tx = {
      productImage: {
        findUnique: vi.fn().mockResolvedValue({ productId: 'p1', isPrimary: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ id: 'img2' }),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            productRow('ACTIVE', [
              imageRow({ id: 'img2', isPrimary: true }),
              imageRow({ id: 'img1', isPrimary: false }),
            ]),
          ),
      },
    };
    const { service, audit } = buildService(db);

    const result = await service.setPrimaryImage(SUPER_ADMIN, 'img2');

    expect(tx.productImage.updateMany).toHaveBeenCalledWith({
      where: { productId: 'p1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(tx.productImage.update).toHaveBeenCalledWith({
      where: { id: 'img2' },
      data: { isPrimary: true },
    });
    expect(result.images[0].id).toBe('img2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_IMAGE_PRIMARY_CHANGED, entityId: 'img2' }),
    );
  });

  it('does nothing when the target is already primary', async () => {
    const tx = {
      productImage: {
        findUnique: vi.fn().mockResolvedValue({ productId: 'p1', isPrimary: true }),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: { findUnique: vi.fn().mockResolvedValue(productRow('ACTIVE', [imageRow()])) },
    };
    const { service } = buildService(db);

    await service.setPrimaryImage(SUPER_ADMIN, 'img1');

    expect(tx.productImage.updateMany).not.toHaveBeenCalled();
    expect(tx.productImage.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown image', async () => {
    const tx = { productImage: { findUnique: vi.fn().mockResolvedValue(null) } };
    const db = { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
    const { service } = buildService(db);

    await expect(service.setPrimaryImage(SUPER_ADMIN, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ProductsService.reorderImages', () => {
  function reorderDb(options: {
    found: Array<{ productId: string }>;
    existing: Array<{ id: string }>;
    primaryCount: number;
  }) {
    const tx = {
      productImage: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(options.found)
          .mockResolvedValueOnce(options.existing),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(options.primaryCount),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            productRow('ACTIVE', [
              imageRow({ id: 'img2', sortOrder: 0, isPrimary: true }),
              imageRow({ id: 'img1', sortOrder: 1, isPrimary: false }),
            ]),
          ),
      },
    };
    return { db, tx };
  }

  it('applies a new order to every image and audits PRODUCT_IMAGES_REORDERED', async () => {
    const { db, tx } = reorderDb({
      found: [{ productId: 'p1' }, { productId: 'p1' }],
      existing: [{ id: 'img1' }, { id: 'img2' }],
      primaryCount: 1,
    });
    const { service, audit } = buildService(db);

    const result = await service.reorderImages(SUPER_ADMIN, { orderedImageIds: ['img2', 'img1'] });

    expect(tx.productImage.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'img2' },
      data: { sortOrder: 0 },
    });
    expect(tx.productImage.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'img1' },
      data: { sortOrder: 1 },
    });
    expect(tx.productImage.updateMany).not.toHaveBeenCalled();
    expect(result.images[0].id).toBe('img2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_IMAGES_REORDERED, entityId: 'p1' }),
    );
  });

  it('normalizes a missing primary to the first image', async () => {
    const { db, tx } = reorderDb({
      found: [{ productId: 'p1' }, { productId: 'p1' }],
      existing: [{ id: 'img1' }, { id: 'img2' }],
      primaryCount: 0,
    });
    const { service } = buildService(db);

    await service.reorderImages(SUPER_ADMIN, { orderedImageIds: ['img1', 'img2'] });

    expect(tx.productImage.updateMany).toHaveBeenCalledWith({
      where: { productId: 'p1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(tx.productImage.update).toHaveBeenCalledWith({
      where: { id: 'img1' },
      data: { isPrimary: true },
    });
  });

  it('rejects an unknown or foreign image without writing anything', async () => {
    const { db, tx } = reorderDb({
      found: [{ productId: 'p1' }, { productId: 'p2' }],
      existing: [],
      primaryCount: 1,
    });
    const { service } = buildService(db);

    await expect(
      service.reorderImages(SUPER_ADMIN, { orderedImageIds: ['img1', 'img2'] }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.productImage.update).not.toHaveBeenCalled();
  });

  it('rejects when the list omits an existing product image', async () => {
    const { db, tx } = reorderDb({
      found: [{ productId: 'p1' }, { productId: 'p1' }],
      existing: [{ id: 'img1' }, { id: 'img2' }, { id: 'img3' }],
      primaryCount: 1,
    });
    const { service } = buildService(db);

    await expect(
      service.reorderImages(SUPER_ADMIN, { orderedImageIds: ['img2', 'img1'] }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.productImage.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate ids', async () => {
    const { db, tx } = reorderDb({
      found: [{ productId: 'p1' }],
      existing: [{ id: 'img1' }],
      primaryCount: 1,
    });
    const { service } = buildService(db);

    await expect(
      service.reorderImages(SUPER_ADMIN, { orderedImageIds: ['img1', 'img1'] }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.productImage.update).not.toHaveBeenCalled();
  });
});

describe('ProductsService.removeImage', () => {
  it('promotes the next image and deletes the external asset', async () => {
    const tx = {
      productImage: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ productId: 'p1', isPrimary: true, providerPublicId: 'public/img1' }),
        delete: vi.fn().mockResolvedValue({ id: 'img1' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'img2' }),
        update: vi.fn().mockResolvedValue({ id: 'img2' }),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            productRow('ACTIVE', [
              imageRow({ id: 'img2', imageUrl: 'https://cdn.example/2.jpg', isPrimary: true }),
            ]),
          ),
      },
    };
    const { service, audit, mediaStorage } = buildService(db);

    const result = await service.removeImage(SUPER_ADMIN, 'img1');

    expect(tx.productImage.update).toHaveBeenCalledWith({
      where: { id: 'img2' },
      data: { isPrimary: true },
    });
    expect(mediaStorage.deletePublicImage).toHaveBeenCalledWith('public/img1');
    expect(result.images[0].isPrimary).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.PRODUCT_IMAGE_REMOVED, entityId: 'img1' }),
    );
  });

  it('audits MEDIA_CLEANUP_FAILED when the external delete fails', async () => {
    const tx = {
      productImage: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            productId: 'p1',
            isPrimary: false,
            providerPublicId: 'public/img1',
          }),
        delete: vi.fn().mockResolvedValue({ id: 'img1' }),
      },
    };
    const db = {
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      product: { findUnique: vi.fn().mockResolvedValue(productRow('ACTIVE', [])) },
    };
    const mediaStorage = fakeProvider({
      deletePublicImage: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { service, audit } = buildService(db, mediaStorage);

    await service.removeImage(SUPER_ADMIN, 'img1');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.MEDIA_CLEANUP_FAILED,
        actorRole: 'SYSTEM',
        entityId: 'img1',
      }),
    );
  });

  it('throws NotFoundException for an unknown image without touching the provider', async () => {
    const tx = { productImage: { findUnique: vi.fn().mockResolvedValue(null) } };
    const db = { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };
    const { service, mediaStorage } = buildService(db);

    await expect(service.removeImage(SUPER_ADMIN, 'missing')).rejects.toThrow(NotFoundException);
    expect(mediaStorage.deletePublicImage).not.toHaveBeenCalled();
  });
});

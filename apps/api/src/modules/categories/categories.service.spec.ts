import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import type { MediaStorageProvider } from '../media/media-storage-provider.interface';
import { CategoriesService } from './categories.service';

const SUPER_ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

function fakeProvider(
  overrides: Partial<Pick<MediaStorageProvider, 'uploadPublicImage' | 'deletePublicImage'>> = {},
) {
  return {
    uploadPublicImage: vi.fn().mockResolvedValue({
      secureUrl: 'https://cdn.example/category.jpg',
      publicId: 'public/categories/c1/abcd-1234',
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
  const service = new CategoriesService(prisma, audit, mediaStorage);
  return { service, db, audit, mediaStorage };
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

function pngFile() {
  return {
    buffer: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8),
    ]),
    mimetype: 'image/png',
    originalname: 'photo.png',
  };
}

describe('CategoriesService.create', () => {
  it('derives a slug when not supplied and audits CATEGORY_CREATED', async () => {
    const db = { category: { create: vi.fn().mockResolvedValue(categoryRow()) } };
    const { service, audit } = buildService(db);

    const result = await service.create(SUPER_ADMIN, { name: 'Biryani & Rice Meals' });

    expect(result.slug).toBe('biryani-and-rice-meals');
    expect(db.category.create.mock.calls[0][0].data.slug).toBe('biryani-rice-meals');
    expect(db.category.create.mock.calls[0][0].data.imageUrl).toBeUndefined();
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

describe('CategoriesService.uploadImage', () => {
  it('uploads the first category image and audits CATEGORY_IMAGE_UPLOADED', async () => {
    const db = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'c1', imagePublicId: null }),
        update: vi.fn().mockResolvedValue(categoryRow()),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...categoryRow(), imageUrl: 'https://cdn.example/category.jpg' }),
      },
    };
    const { service, audit, mediaStorage } = buildService(db);

    const result = await service.uploadImage(SUPER_ADMIN, 'c1', pngFile());

    expect(mediaStorage.uploadPublicImage).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'hungry-box/catalog/categories/c1',
        publicId: expect.any(String),
      }),
    );
    expect(db.category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        imageUrl: 'https://cdn.example/category.jpg',
        imagePublicId: 'public/categories/c1/abcd-1234',
        imageResourceType: 'image',
      },
    });
    expect(result.imageUrl).toBe('https://cdn.example/category.jpg');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.CATEGORY_IMAGE_UPLOADED, entityId: 'c1' }),
    );
  });

  it('replaces an existing image, deleting only the old asset, and audits CATEGORY_IMAGE_REPLACED', async () => {
    const db = {
      category: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'c1', imagePublicId: 'public/categories/c1/old' }),
        update: vi.fn().mockResolvedValue(categoryRow()),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...categoryRow(), imageUrl: 'https://cdn.example/category.jpg' }),
      },
    };
    const { service, audit, mediaStorage } = buildService(db);

    await service.uploadImage(SUPER_ADMIN, 'c1', pngFile());

    expect(mediaStorage.deletePublicImage).toHaveBeenCalledWith('public/categories/c1/old');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.CATEGORY_IMAGE_REPLACED, entityId: 'c1' }),
    );
  });

  it('throws NotFoundException for a missing category', async () => {
    const db = { category: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const { service, mediaStorage } = buildService(db);

    await expect(service.uploadImage(SUPER_ADMIN, 'missing', pngFile())).rejects.toThrow(
      NotFoundException,
    );
    expect(mediaStorage.uploadPublicImage).not.toHaveBeenCalled();
  });

  it('rejects an invalid file before any external call', async () => {
    const db = {
      category: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', imagePublicId: null }) },
    };
    const { service, mediaStorage } = buildService(db);

    await expect(
      service.uploadImage(SUPER_ADMIN, 'c1', { buffer: Buffer.from('nope') }),
    ).rejects.toThrow(BadRequestException);
    expect(mediaStorage.uploadPublicImage).not.toHaveBeenCalled();
  });

  it('cleans up the new asset and audits the failure when the DB write fails', async () => {
    const db = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'c1', imagePublicId: null }),
        update: vi.fn().mockRejectedValue(new Error('db down')),
      },
    };
    const mediaStorage = fakeProvider({
      deletePublicImage: vi.fn().mockRejectedValue(new Error('cloud down')),
    });
    const { service, audit } = buildService(db, mediaStorage);

    await expect(service.uploadImage(SUPER_ADMIN, 'c1', pngFile())).rejects.toThrow('db down');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.MEDIA_CLEANUP_FAILED,
        actorRole: 'SYSTEM',
        entityId: 'c1',
      }),
    );
  });
});

describe('CategoriesService.removeImage', () => {
  it('clears the image fields, deletes the asset and audits CATEGORY_IMAGE_REMOVED', async () => {
    const db = {
      category: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'c1', imagePublicId: 'public/categories/c1/old' }),
        update: vi.fn().mockResolvedValue(categoryRow()),
        findUniqueOrThrow: vi.fn().mockResolvedValue(categoryRow()),
      },
    };
    const { service, audit, mediaStorage } = buildService(db);

    const result = await service.removeImage(SUPER_ADMIN, 'c1');

    expect(db.category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { imageUrl: null, imagePublicId: null, imageResourceType: null },
    });
    expect(mediaStorage.deletePublicImage).toHaveBeenCalledWith('public/categories/c1/old');
    expect(result.imageUrl).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.CATEGORY_IMAGE_REMOVED, entityId: 'c1' }),
    );
  });

  it('throws BadRequestException when the category has no image', async () => {
    const db = {
      category: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', imagePublicId: null }) },
    };
    const { service, mediaStorage } = buildService(db);

    await expect(service.removeImage(SUPER_ADMIN, 'c1')).rejects.toThrow(BadRequestException);
    expect(mediaStorage.deletePublicImage).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a missing category', async () => {
    const db = { category: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { service } = buildService(db);

    await expect(service.removeImage(SUPER_ADMIN, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('audits MEDIA_CLEANUP_FAILED when the external delete fails', async () => {
    const db = {
      category: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'c1', imagePublicId: 'public/categories/c1/old' }),
        update: vi.fn().mockResolvedValue(categoryRow()),
        findUniqueOrThrow: vi.fn().mockResolvedValue(categoryRow()),
      },
    };
    const mediaStorage = fakeProvider({
      deletePublicImage: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { service, audit } = buildService(db, mediaStorage);

    await service.removeImage(SUPER_ADMIN, 'c1');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AuditKinds.MEDIA_CLEANUP_FAILED,
        actorRole: 'SYSTEM',
        entityId: 'c1',
      }),
    );
  });
});

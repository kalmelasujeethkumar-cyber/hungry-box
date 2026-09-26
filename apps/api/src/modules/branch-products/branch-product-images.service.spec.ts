import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { MediaStorageProvider, PublicImageFile } from '../media/media-storage-provider.interface';
import { MAX_BRANCH_PRODUCT_IMAGES } from './branch-product-images.service';
import { BranchProductImagesService } from './branch-product-images.service';
import { BranchProductsService } from './branch-products.service';

const MANAGER = { role: 'BRANCH_MANAGER' as const, branchId: 'b1', userId: 'u-mgr' };
const ADMIN = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function jpegFile(sizeBytes = JPEG.length): PublicImageFile {
  return { buffer: Buffer.concat([JPEG, Buffer.alloc(Math.max(0, sizeBytes - JPEG.length))]) };
}

function svgFile(): PublicImageFile {
  return { buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') };
}

function imageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bi-1',
    branchProductId: 'bp-1',
    isPrimary: true,
    providerPublicId: 'hungry-box/catalog/branches/b1/products/bp-1/abc',
    branchProduct: { branchId: 'b1' },
    ...overrides,
  };
}

type DbMock = {
  branchProduct: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  branchProductImage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

function buildService(
  db: Partial<DbMock>,
  mediaOverrides: Partial<MediaStorageProvider> = {},
  branchProductDto: Record<string, unknown> = {},
) {
  const client = {
    branchProduct: {
      findUnique: vi.fn().mockResolvedValue({ id: 'bp-1', branchId: 'b1' }),
    },
    branchProductImage: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'bi-new' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'bp-1' }]),
    $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(client),
    ),
    ...db,
  } as unknown as DbMock;

  const prisma = { requireClient: vi.fn().mockReturnValue(client) } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const mediaStorage = {
    uploadPublicImage: vi.fn().mockResolvedValue({
      secureUrl: 'https://res.cloudinary.com/hungrybox/image/upload/v1/stored.jpg',
      publicId: 'stored-public-id',
      resourceType: 'image',
    }),
    deletePublicImage: vi.fn().mockResolvedValue(undefined),
    ...mediaOverrides,
  } as unknown as MediaStorageProvider;
  const branchProducts = {
    getForActor: vi.fn().mockResolvedValue(branchProductDto),
  } as unknown as BranchProductsService;

  return {
    service: new BranchProductImagesService(prisma, audit, branchProducts, mediaStorage),
    db: client,
    audit,
    mediaStorage,
    branchProducts,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BranchProductImagesService.upload', () => {
  it('stores the first branch image as primary and audits it with the branch scope', async () => {
    const { service, db, audit, mediaStorage } = buildService({});

    await service.upload(MANAGER, 'bp-1', jpegFile(), '  Masala chai  ');

    expect(mediaStorage.uploadPublicImage).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'hungry-box/catalog/branches/b1/products/bp-1',
      }),
    );
    expect(db.branchProductImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchProductId: 'bp-1',
        altText: 'Masala chai',
        sortOrder: 0,
        isPrimary: true,
      }),
      select: { id: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'BRANCH_PRODUCT_IMAGE_UPLOADED',
        branchId: 'b1',
        actorId: 'u-mgr',
      }),
    );
  });

  it('appends without becoming primary when the branch already has images', async () => {
    const { service, db } = buildService({});
    (db.branchProductImage.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (db.branchProductImage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ sortOrder: 1 });

    await service.upload(MANAGER, 'bp-1', jpegFile());

    expect(db.branchProductImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 2, isPrimary: false }),
      select: { id: true },
    });
  });

  it('appends after the highest existing order when an earlier image was removed', async () => {
    const { service, db } = buildService({});
    (db.branchProductImage.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (db.branchProductImage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ sortOrder: 7 });

    await service.upload(MANAGER, 'bp-1', jpegFile());

    expect(db.branchProductImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 8, isPrimary: false }),
      select: { id: true },
    });
  });

  it('refuses to exceed the per-branch image cap and cleans up the stored asset', async () => {
    const { service, db, mediaStorage } = buildService({});
    (db.branchProductImage.count as ReturnType<typeof vi.fn>).mockResolvedValue(
      MAX_BRANCH_PRODUCT_IMAGES,
    );

    await expect(service.upload(MANAGER, 'bp-1', jpegFile())).rejects.toThrow(BadRequestException);
    expect(db.branchProductImage.create).not.toHaveBeenCalled();
    expect(mediaStorage.deletePublicImage).toHaveBeenCalledWith('stored-public-id');
  });

  it('rejects a non-image payload before calling the storage provider', async () => {
    const { service, mediaStorage } = buildService({});

    await expect(service.upload(MANAGER, 'bp-1', svgFile())).rejects.toThrow(
      'Unsupported image type. Allowed: JPEG, PNG, WebP',
    );
    expect(mediaStorage.uploadPublicImage).not.toHaveBeenCalled();
  });

  it('rejects a file larger than the 5 MB limit before calling the storage provider', async () => {
    const { service, mediaStorage } = buildService({});

    await expect(service.upload(MANAGER, 'bp-1', jpegFile(5 * 1024 * 1024 + 1))).rejects.toThrow(
      'Image exceeds the 5 MB limit',
    );
    expect(mediaStorage.uploadPublicImage).not.toHaveBeenCalled();
  });

  it('never calls the storage provider for a branch product outside the actor scope', async () => {
    const { service, mediaStorage } = buildService({
      branchProduct: {
        findUnique: vi.fn().mockResolvedValue({ id: 'bp-2', branchId: 'b2' }),
      },
    } as Partial<DbMock>);

    await expect(service.upload(MANAGER, 'bp-2', jpegFile())).rejects.toThrow(NotFoundException);
    expect(mediaStorage.uploadPublicImage).not.toHaveBeenCalled();
  });

  it('lets a super admin manage any branch', async () => {
    const { service } = buildService({
      branchProduct: { findUnique: vi.fn().mockResolvedValue({ id: 'bp-2', branchId: 'b2' }) },
    } as Partial<DbMock>);

    await expect(service.upload(ADMIN, 'bp-2', jpegFile())).resolves.toBeDefined();
  });
});

describe('BranchProductImagesService.setPrimary', () => {
  it('demotes the previous primary and promotes the requested image', async () => {
    const { service, db, audit } = buildService({
      branchProductImage: {
        findUnique: vi.fn().mockResolvedValue(imageRow({ isPrimary: false, id: 'bi-2' })),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await service.setPrimary(MANAGER, 'bi-2');

    expect(db.branchProductImage.updateMany).toHaveBeenCalledWith({
      where: { branchProductId: 'bp-1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(db.branchProductImage.update).toHaveBeenCalledWith({
      where: { id: 'bi-2' },
      data: { isPrimary: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BRANCH_PRODUCT_IMAGE_PRIMARY_CHANGED', branchId: 'b1' }),
    );
  });

  it('is a no-op write when the image is already primary', async () => {
    const { service, db } = buildService({
      branchProductImage: {
        findUnique: vi.fn().mockResolvedValue(imageRow({ isPrimary: true })),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await service.setPrimary(MANAGER, 'bi-1');

    expect(db.branchProductImage.update).not.toHaveBeenCalled();
  });

  it('hides another branch image from a branch manager', async () => {
    const { service, db } = buildService({
      branchProductImage: {
        findUnique: vi
          .fn()
          .mockResolvedValue(imageRow({ id: 'bi-9', branchProduct: { branchId: 'b2' } })),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await expect(service.setPrimary(MANAGER, 'bi-9')).rejects.toThrow(NotFoundException);
    expect(db.branchProductImage.update).not.toHaveBeenCalled();
    expect(db.branchProductImage.updateMany).not.toHaveBeenCalled();
  });

  it('throws for an unknown image id', async () => {
    const { service } = buildService({
      branchProductImage: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await expect(service.setPrimary(MANAGER, 'missing')).rejects.toThrow(NotFoundException);
  });
});

describe('BranchProductImagesService.reorder', () => {
  it('rejects a mixed-branch or partial ordering', async () => {
    const { service, db } = buildService({
      branchProductImage: {
        findUnique: vi.fn(),
        findMany: vi
          .fn()
          .mockResolvedValue([{ branchProductId: 'bp-1' }, { branchProductId: 'bp-9' }]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await expect(
      service.reorder(MANAGER, { orderedImageIds: ['bi-1', 'bi-9'] }),
    ).rejects.toThrow(BadRequestException);
    expect(db.branchProductImage.update).not.toHaveBeenCalled();
  });

  it('rejects an ordering that omits one of the branch product images', async () => {
    const { service, db } = buildService({
      branchProductImage: {
        findUnique: vi.fn(),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ branchProductId: 'bp-1' }])
          .mockResolvedValueOnce([{ id: 'bi-1' }, { id: 'bi-2' }]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await expect(service.reorder(MANAGER, { orderedImageIds: ['bi-1'] })).rejects.toThrow(
      'orderedImageIds must include every image of the branch product',
    );
    expect(db.branchProductImage.update).not.toHaveBeenCalled();
  });

  it('applies the requested order and keeps exactly one primary', async () => {
    const { service, db, audit } = buildService({
      branchProductImage: {
        findUnique: vi.fn(),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ branchProductId: 'bp-1' }, { branchProductId: 'bp-1' }])
          .mockResolvedValueOnce([{ id: 'bi-1' }, { id: 'bi-2' }]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await service.reorder(MANAGER, { orderedImageIds: ['bi-2', 'bi-1'] });

    expect(db.branchProductImage.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'bi-2' },
      data: { sortOrder: 0 },
    });
    expect(db.branchProductImage.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'bi-1' },
      data: { sortOrder: 1 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BRANCH_PRODUCT_IMAGES_REORDERED', branchId: 'b1' }),
    );
  });

  it('promotes the first ordered image when several were primary', async () => {
    const { service, db } = buildService({
      branchProductImage: {
        findUnique: vi.fn(),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ branchProductId: 'bp-1' }])
          .mockResolvedValueOnce([{ id: 'bi-1' }]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(2),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await service.reorder(MANAGER, { orderedImageIds: ['bi-1'] });

    expect(db.branchProductImage.update).toHaveBeenLastCalledWith({
      where: { id: 'bi-1' },
      data: { isPrimary: true },
    });
  });

  it('refuses to reorder images of another branch product', async () => {
    const { service, db } = buildService({
      branchProduct: {
        findUnique: vi.fn().mockResolvedValue({ id: 'bp-2', branchId: 'b2' }),
      },
      branchProductImage: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ branchProductId: 'bp-2' }]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
      },
    } as unknown as Partial<DbMock>);

    await expect(service.reorder(MANAGER, { orderedImageIds: ['bi-1'] })).rejects.toThrow(
      NotFoundException,
    );
    expect(db.branchProductImage.update).not.toHaveBeenCalled();
  });
});

describe('BranchProductImagesService.remove', () => {
  it('deletes the image, promotes the next one, and deletes the stored asset', async () => {
    const { service, db, mediaStorage, audit } = buildService({
      branchProductImage: {
        findUnique: vi.fn().mockResolvedValue(imageRow({ isPrimary: true })),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ id: 'bi-2' }),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Partial<DbMock>);

    await service.remove(MANAGER, 'bi-1');

    expect(db.branchProductImage.delete).toHaveBeenCalledWith({ where: { id: 'bi-1' } });
    expect(db.branchProductImage.update).toHaveBeenCalledWith({
      where: { id: 'bi-2' },
      data: { isPrimary: true },
    });
    expect(mediaStorage.deletePublicImage).toHaveBeenCalledWith(
      'hungry-box/catalog/branches/b1/products/bp-1/abc',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BRANCH_PRODUCT_IMAGE_REMOVED', branchId: 'b1' }),
    );
  });

  it('does not promote anything when a non-primary image is removed', async () => {
    const { service, db } = buildService({
      branchProductImage: {
        findUnique: vi.fn().mockResolvedValue(imageRow({ id: 'bi-2', isPrimary: false })),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Partial<DbMock>);

    await service.remove(MANAGER, 'bi-2');

    expect(db.branchProductImage.update).not.toHaveBeenCalled();
  });

  it('records a media cleanup failure when the provider delete rejects', async () => {
    const { service, audit } = buildService(
      {
        branchProductImage: {
          findUnique: vi.fn().mockResolvedValue(imageRow({ isPrimary: false })),
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn(),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          delete: vi.fn().mockResolvedValue({}),
        },
      } as unknown as Partial<DbMock>,
      { deletePublicImage: vi.fn().mockRejectedValue(new Error('cloudinary down')) },
    );

    await service.remove(MANAGER, 'bi-1');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'MEDIA_CLEANUP_FAILED', actorRole: 'SYSTEM' }),
    );
  });

  it('hides another branch image from a branch manager', async () => {
    const { service, db } = buildService({
      branchProductImage: {
        findUnique: vi
          .fn()
          .mockResolvedValue(imageRow({ id: 'bi-9', branchProduct: { branchId: 'b2' } })),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Partial<DbMock>);

    await expect(service.remove(MANAGER, 'bi-9')).rejects.toThrow(NotFoundException);
    expect(db.branchProductImage.delete).not.toHaveBeenCalled();
  });
});

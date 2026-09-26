import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { BranchProductDto } from '@hungrybox/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditTargetClient } from '../audit/audit.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { MEDIA_STORAGE_PROVIDER } from '../media/media-storage-provider.interface';
import type { MediaStorageProvider, PublicImageFile } from '../media/media-storage-provider.interface';
import { validatePublicImage } from '../media/public-image-validator';
import { enforcedBranchId } from './branch-scope';
import { BranchProductActor, BranchProductsService } from './branch-products.service';
import { ReorderBranchProductImagesDto } from './dto/reorder-branch-product-images.dto';

export const MAX_BRANCH_PRODUCT_IMAGES = 3;

type Tx = AuditTargetClient;

/**
 * Branch-owned product media. Every mutation resolves the owning BranchProduct and
 * compares it with the actor's server-derived branch scope, so a branch manager can
 * only ever touch media of their own branch. Global ProductImage rows are never
 * read for mutation here.
 */
@Injectable()
export class BranchProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branchProducts: BranchProductsService,
    @Inject(MEDIA_STORAGE_PROVIDER) private readonly mediaStorage: MediaStorageProvider,
  ) {}

  async upload(
    actor: BranchProductActor,
    branchProductId: string,
    file: PublicImageFile,
    altText?: string | null,
  ): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();
    validatePublicImage(file);
    const alt = altText?.trim() ? altText.trim().slice(0, 500) : null;

    // Scoped read happens before any provider call so an out-of-scope request can
    // never create a stored asset.
    const owned = await this.requireOwnedBranchProduct(db, actor, branchProductId);

    const stored = await this.mediaStorage.uploadPublicImage({
      buffer: file.buffer,
      folder: `hungry-box/catalog/branches/${owned.branchId}/products/${owned.id}`,
      publicId: randomUUID(),
    });

    let persisted: { id: string };
    try {
      persisted = await db.$transaction(async (tx) => {
        await this.requireBranchProductLock(tx, owned.id);
        const count = await tx.branchProductImage.count({
          where: { branchProductId: owned.id },
        });
        if (count >= MAX_BRANCH_PRODUCT_IMAGES) {
          throw new BadRequestException(
            `A branch product can have at most ${MAX_BRANCH_PRODUCT_IMAGES} images`,
          );
        }
        // Appending after the highest existing order rather than after the row
        // count keeps orders unique when an image in the middle was removed.
        const last = await tx.branchProductImage.findFirst({
          where: { branchProductId: owned.id },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        return tx.branchProductImage.create({
          data: {
            branchProductId: owned.id,
            imageUrl: stored.secureUrl,
            providerPublicId: stored.publicId,
            resourceType: stored.resourceType,
            altText: alt,
            sortOrder: (last?.sortOrder ?? -1) + 1,
            isPrimary: count === 0,
          },
          select: { id: true },
        });
      });
    } catch (error) {
      await this.bestEffortDeleteAsset(
        'branch_product_image',
        owned.id,
        stored.publicId,
        'Orphaned asset rejected after aborted branch product image upload',
      );
      throw error;
    }

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_PRODUCT_IMAGE_UPLOADED,
      entityType: 'branch_product_image',
      entityId: persisted.id,
      branchId: owned.branchId,
      message: `Image uploaded to branch product ${owned.id}`,
    });

    return this.branchProducts.getForActor(actor, owned.id);
  }

  async setPrimary(actor: BranchProductActor, imageId: string): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();

    const owned = await db.$transaction(async (tx) => {
      const image = await this.requireOwnedImage(tx, actor, imageId);
      await this.requireBranchProductLock(tx, image.branchProductId);
      if (!image.isPrimary) {
        await tx.branchProductImage.updateMany({
          where: { branchProductId: image.branchProductId, isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.branchProductImage.update({
          where: { id: imageId },
          data: { isPrimary: true },
        });
      }
      return image;
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_PRODUCT_IMAGE_PRIMARY_CHANGED,
      entityType: 'branch_product_image',
      entityId: imageId,
      branchId: owned.branchId,
      message: `Primary branch image changed for branch product ${owned.branchProductId}`,
    });

    return this.branchProducts.getForActor(actor, owned.branchProductId);
  }

  async reorder(
    actor: BranchProductActor,
    dto: ReorderBranchProductImagesDto,
  ): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();
    const { orderedImageIds } = dto;

    const owned = await db.$transaction(async (tx) => {
      const images = await tx.branchProductImage.findMany({
        where: { id: { in: orderedImageIds } },
        select: { branchProductId: true },
      });
      const branchProductIds = new Set(images.map((image) => image.branchProductId));
      if (branchProductIds.size !== 1) {
        throw new BadRequestException(
          'All images must belong to the same branch product and exist',
        );
      }
      const [branchProductId] = branchProductIds;
      const scoped = await this.requireOwnedBranchProduct(tx, actor, branchProductId);
      await this.requireBranchProductLock(tx, scoped.id);

      const existing = await tx.branchProductImage.findMany({
        where: { branchProductId: scoped.id },
        select: { id: true },
      });
      const existingIds = existing.map((image) => image.id).sort();
      const expectedIds = [...orderedImageIds].sort();
      if (
        existingIds.length !== expectedIds.length ||
        existingIds.some((id, index) => id !== expectedIds[index])
      ) {
        throw new BadRequestException(
          'orderedImageIds must include every image of the branch product',
        );
      }

      for (let index = 0; index < orderedImageIds.length; index += 1) {
        await tx.branchProductImage.update({
          where: { id: orderedImageIds[index] },
          data: { sortOrder: index },
        });
      }

      const primaryCount = await tx.branchProductImage.count({
        where: { branchProductId: scoped.id, isPrimary: true },
      });
      if (primaryCount !== 1) {
        await tx.branchProductImage.updateMany({
          where: { branchProductId: scoped.id, isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.branchProductImage.update({
          where: { id: orderedImageIds[0] },
          data: { isPrimary: true },
        });
      }
      return scoped;
    });

    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_PRODUCT_IMAGES_REORDERED,
      entityType: 'branch_product',
      entityId: owned.id,
      branchId: owned.branchId,
      message: `Branch product ${owned.id} images reordered`,
    });

    return this.branchProducts.getForActor(actor, owned.id);
  }

  async remove(actor: BranchProductActor, imageId: string): Promise<BranchProductDto> {
    const db = this.prisma.requireClient();

    const removed = await db.$transaction(async (tx) => {
      const image = await this.requireOwnedImage(tx, actor, imageId);
      await this.requireBranchProductLock(tx, image.branchProductId);
      await tx.branchProductImage.delete({ where: { id: imageId } });
      if (image.isPrimary) {
        const next = await tx.branchProductImage.findFirst({
          where: { branchProductId: image.branchProductId },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.branchProductImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
      return { branchProductId: image.branchProductId, providerPublicId: image.providerPublicId };
    });

    if (removed.providerPublicId) {
      await this.bestEffortDeleteAsset(
        'branch_product_image',
        imageId,
        removed.providerPublicId,
        `Failed to delete branch product image asset (${imageId})`,
      );
    }

    const finalOwner = await this.requireOwnedBranchProduct(db, actor, removed.branchProductId);
    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.BRANCH_PRODUCT_IMAGE_REMOVED,
      entityType: 'branch_product_image',
      entityId: imageId,
      branchId: finalOwner.branchId,
      message: `Image removed from branch product ${removed.branchProductId}`,
    });

    return this.branchProducts.getForActor(actor, removed.branchProductId);
  }

  private async requireOwnedBranchProduct(
    db: Tx,
    actor: BranchProductActor,
    branchProductId: string,
  ): Promise<{ id: string; branchId: string }> {
    const scopeBranchId = enforcedBranchId(actor);
    const existing = await db.branchProduct.findUnique({
      where: { id: branchProductId },
      select: { id: true, branchId: true },
    });
    if (!existing || (scopeBranchId !== null && existing.branchId !== scopeBranchId)) {
      throw new NotFoundException('Branch product not found');
    }
    return existing;
  }

  private async requireOwnedImage(
    db: Tx,
    actor: BranchProductActor,
    imageId: string,
  ): Promise<{
    id: string;
    branchProductId: string;
    branchId: string;
    isPrimary: boolean;
    providerPublicId: string | null;
  }> {
    const image = await db.branchProductImage.findUnique({
      where: { id: imageId },
      select: {
        id: true,
        branchProductId: true,
        isPrimary: true,
        providerPublicId: true,
        branchProduct: { select: { branchId: true } },
      },
    });
    if (!image) {
      throw new NotFoundException('Branch product image not found');
    }
    const scopeBranchId = enforcedBranchId(actor);
    if (scopeBranchId !== null && image.branchProduct.branchId !== scopeBranchId) {
      throw new NotFoundException('Branch product image not found');
    }
    return {
      id: image.id,
      branchProductId: image.branchProductId,
      branchId: image.branchProduct.branchId,
      isPrimary: image.isPrimary,
      providerPublicId: image.providerPublicId,
    };
  }

  private async requireBranchProductLock(db: Tx, branchProductId: string): Promise<void> {
    const locked = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "BranchProduct" WHERE id = ${branchProductId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundException('Branch product not found');
    }
  }

  private async bestEffortDeleteAsset(
    entityType: string,
    entityId: string,
    publicId: string,
    message: string,
  ): Promise<void> {
    try {
      await this.mediaStorage.deletePublicImage(publicId);
    } catch {
      try {
        await this.audit.record({
          actorRole: 'SYSTEM',
          kind: AuditKinds.MEDIA_CLEANUP_FAILED,
          entityType,
          entityId,
          message,
        });
      } catch {
        // Cleanup is best-effort by contract; a failing audit write must not surface.
      }
    }
  }
}

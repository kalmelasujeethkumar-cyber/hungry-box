import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  KycDocumentAccessDto,
  KycDocumentDto,
  KycDocumentType,
  KycListItemDto,
  KycOverallState,
  KycStatusDto,
  UserRole,
} from '@hungrybox/shared';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import {
  KYC_STORAGE_FOLDER,
  PRIVATE_KYC_STORAGE_PROVIDER,
} from '../media/private-document-storage.interface';
import type { PrivateDocumentFile, PrivateDocumentStorageProvider } from '../media/private-document-storage.interface';
import { validatePrivateKycDocument } from '../media/private-document-validator';
import type { PrivateDocumentFormat } from '../media/private-document-validator';
import type { ReviewKycDocumentDto } from './dto/review-kyc-document.dto';

export interface KycActor {
  role: UserRole;
  branchId: string | null;
  userId: string;
}

const kycProfileInclude = {
  branch: { select: { id: true, name: true } },
  documents: true,
} satisfies Prisma.DeliveryPartnerProfileInclude;

type KycProfileRow = Prisma.DeliveryPartnerProfileGetPayload<{
  include: typeof kycProfileInclude;
}>;

type KycDocumentRow = KycProfileRow['documents'][number];

const KYC_DOCUMENT_TYPES: readonly KycDocumentType[] = ['AADHAAR', 'DRIVING_LICENSE'];

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PRIVATE_KYC_STORAGE_PROVIDER)
    private readonly storage: PrivateDocumentStorageProvider,
  ) {}

  async getMyKyc(userId: string): Promise<KycStatusDto> {
    const db = this.prisma.requireClient();
    const profile = await db.deliveryPartnerProfile.findUnique({
      where: { userId },
      include: kycProfileInclude,
    });
    if (!profile) {
      throw new NotFoundException('Delivery partner profile not found');
    }
    return toKycStatusDto(profile);
  }

  async uploadMyDocument(
    userId: string,
    type: string,
    file: PrivateDocumentFile | undefined,
  ): Promise<KycStatusDto> {
    const kycType = requireKycType(type);
    if (!file) {
      throw new BadRequestException('A document image is required');
    }
    const format = validatePrivateKycDocument(file);
    const db = this.prisma.requireClient();
    const profile = await db.deliveryPartnerProfile.findUnique({
      where: { userId },
      include: kycProfileInclude,
    });
    if (!profile) {
      throw new NotFoundException('Delivery partner profile not found');
    }
    assertUploadAllowed(profile.status);

    const existing = profile.documents.find((document) => document.type === kycType);
    if (existing?.status === 'VERIFIED') {
      throw new ConflictException('This verified document cannot be replaced');
    }

    const publicId = randomUUID();
    const stored = await this.storage.uploadPrivateDocument({
      buffer: file.buffer,
      folder: KYC_STORAGE_FOLDER,
      publicId,
      format,
    });

    let oldPublicId: string | null;
    try {
      oldPublicId = await db.$transaction(async (tx) => {
        const previous = await tx.deliveryPartnerDocument.findUnique({
          where: {
            deliveryPartnerId_type: { deliveryPartnerId: profile.id, type: kycType },
          },
        });
        if (previous?.status === 'VERIFIED') {
          throw new ConflictException('This verified document cannot be replaced');
        }
        await tx.deliveryPartnerDocument.upsert({
          where: {
            deliveryPartnerId_type: { deliveryPartnerId: profile.id, type: kycType },
          },
          update: {
            status: 'UPLOADED',
            storageProvider: 'cloudinary',
            providerPublicId: stored.publicId,
            resourceType: stored.resourceType,
            format: stored.format,
            fileSize: stored.fileSize,
            documentReference: null,
            verificationNote: null,
            verifiedById: null,
            verifiedAt: null,
          },
          create: {
            deliveryPartnerId: profile.id,
            type: kycType,
            status: 'UPLOADED',
            storageProvider: 'cloudinary',
            providerPublicId: stored.publicId,
            resourceType: stored.resourceType,
            format: stored.format,
            fileSize: stored.fileSize,
          },
        });
        return previous?.providerPublicId ?? null;
      });
    } catch (error) {
      await this.bestEffortDelete(
        stored.publicId,
        `KYC ${kycType} asset cleanup after failed database write for partner ${profile.id}`,
      );
      throw error;
    }

    await this.audit.record({
      actorRole: 'DELIVERY_PARTNER',
      actorId: userId,
      kind: oldPublicId ? AuditKinds.KYC_DOCUMENT_REUPLOADED : AuditKinds.KYC_DOCUMENT_UPLOADED,
      entityType: 'delivery_partner_document',
      entityId: profile.id,
      branchId: profile.branchId,
      message: `KYC ${kycType} ${oldPublicId ? 're-uploaded' : 'uploaded'}`,
    });

    if (oldPublicId) {
      await this.bestEffortDelete(
        oldPublicId,
        `KYC ${kycType} old asset cleanup for partner ${profile.id}`,
      );
    }

    const updated = await db.deliveryPartnerProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: kycProfileInclude,
    });
    return toKycStatusDto(updated);
  }

  async getMyDocumentAccess(
    userId: string,
    type: string,
  ): Promise<KycDocumentAccessDto> {
    const kycType = requireKycType(type);
    const db = this.prisma.requireClient();
    const profile = await db.deliveryPartnerProfile.findUnique({
      where: { userId },
      include: kycProfileInclude,
    });
    if (!profile) {
      throw new NotFoundException('Delivery partner profile not found');
    }
    return this.accessDocument(profile, kycType, {
      role: 'DELIVERY_PARTNER',
      branchId: profile.branchId,
      userId,
    });
  }

  async list(actor: KycActor, branchId?: string): Promise<KycListItemDto[]> {
    const db = this.prisma.requireClient();
    const scopeBranchId = this.enforcedBranchId(actor) ?? branchId;
    const rows = await db.deliveryPartnerProfile.findMany({
      where: scopeBranchId ? { branchId: scopeBranchId } : {},
      select: {
        id: true,
        partnerId: true,
        fullName: true,
        mobile: true,
        status: true,
        documents: { select: { type: true, status: true } },
      },
      orderBy: { partnerId: 'asc' },
    });
    return rows.map(toKycListItemDto);
  }

  async get(actor: KycActor, partnerId: string): Promise<KycStatusDto> {
    const profile = await this.requireProfile(actor, partnerId);
    return toKycStatusDto(profile);
  }

  async getDocumentAccess(
    actor: KycActor,
    partnerId: string,
    type: string,
  ): Promise<KycDocumentAccessDto> {
    const kycType = requireKycType(type);
    const profile = await this.requireProfile(actor, partnerId);
    return this.accessDocument(profile, kycType, actor);
  }

  async reviewDocument(
    actor: KycActor,
    partnerId: string,
    type: string,
    dto: ReviewKycDocumentDto,
  ): Promise<KycStatusDto> {
    if (actor.role !== 'BRANCH_MANAGER') {
      throw new ForbiddenException('Only branch managers may review KYC documents');
    }
    const kycType = requireKycType(type);
    if (dto.action === 'REJECT' && !dto.note?.trim()) {
      throw new BadRequestException('A reason is required to reject a KYC document');
    }
    const profile = await this.requireProfile(actor, partnerId);
    const document = profile.documents.find((doc) => doc.type === kycType);
    if (!document || !document.providerPublicId) {
      throw new NotFoundException('KYC document not found');
    }

    const db = this.prisma.requireClient();
    const updated = await db.$transaction(async (tx) => {
      await tx.deliveryPartnerDocument.update({
        where: { id: document.id },
        data:
          dto.action === 'VERIFY'
            ? {
                status: 'VERIFIED',
                verificationNote: dto.note ?? null,
                verifiedById: actor.userId,
                verifiedAt: new Date(),
              }
            : {
                status: 'REJECTED',
                verificationNote: dto.note ?? null,
                verifiedById: null,
                verifiedAt: null,
              },
      });
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind:
            dto.action === 'VERIFY'
              ? AuditKinds.KYC_DOCUMENT_VERIFIED
              : AuditKinds.KYC_DOCUMENT_REJECTED,
          entityType: 'delivery_partner_document',
          entityId: document.id,
          branchId: profile.branchId,
          message: `KYC ${kycType} document ${dto.action === 'VERIFY' ? 'verified' : 'rejected'}`,
        },
        tx,
      );
      return tx.deliveryPartnerProfile.findFirstOrThrow({
        where: { id: profile.id },
        include: kycProfileInclude,
      });
    });
    return toKycStatusDto(updated);
  }

  enforcedBranchId(actor: KycActor): string | null {
    if (actor.role === 'BRANCH_MANAGER') {
      if (!actor.branchId) {
        throw new ConflictException('Branch manager has no assigned branch');
      }
      return actor.branchId;
    }
    return null;
  }

  private async requireProfile(
    actor: KycActor,
    partnerId: string,
  ): Promise<KycProfileRow> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const profile = await db.deliveryPartnerProfile.findFirst({
      where: {
        id: partnerId,
        ...(enforcedBranchId !== null ? { branchId: enforcedBranchId } : {}),
      },
      include: kycProfileInclude,
    });
    if (!profile) {
      throw new NotFoundException('Partner not found');
    }
    return profile;
  }

  private async accessDocument(
    profile: KycProfileRow,
    kycType: KycDocumentType,
    actor: KycActor,
  ): Promise<KycDocumentAccessDto> {
    const document = profile.documents.find(
      (doc) => doc.type === kycType && doc.providerPublicId && doc.format,
    );
    if (!document || !document.providerPublicId || !document.format) {
      throw new NotFoundException('KYC document not found');
    }
    await this.audit.record({
      actorRole: actor.role,
      actorId: actor.userId,
      kind: AuditKinds.KYC_DOCUMENT_VIEWED,
      entityType: 'delivery_partner_document',
      entityId: profile.id,
      branchId: profile.branchId,
      message: `KYC ${kycType} document viewed`,
    });
    return this.storage.generatePrivateDocumentAccess({
      publicId: document.providerPublicId,
      format: document.format as PrivateDocumentFormat,
    });
  }

  private async bestEffortDelete(publicId: string, context: string): Promise<void> {
    try {
      await this.storage.deletePrivateDocument(publicId);
    } catch (error) {
      await this.audit
        .record({
          actorRole: 'SYSTEM',
          actorId: null,
          kind: AuditKinds.KYC_CLEANUP_FAILED,
          entityType: 'delivery_partner_document',
          entityId: null,
          branchId: null,
          message: `${context} (asset ${publicId}): ${(error as Error)?.message ?? 'unknown error'}`,
        })
        .catch(() => undefined);
    }
  }
}

function requireKycType(type: string): KycDocumentType {
  if (!KYC_DOCUMENT_TYPES.includes(type as KycDocumentType)) {
    throw new BadRequestException(`Unsupported KYC document type: ${type}`);
  }
  return type as KycDocumentType;
}

function assertUploadAllowed(status: string): void {
  if (status === 'SUSPENDED' || status === 'REJECTED') {
    throw new ConflictException(
      'Cannot upload KYC documents for a suspended or rejected partner',
    );
  }
}

function toKycDocumentDto(
  type: KycDocumentType,
  document: KycDocumentRow | undefined,
): KycDocumentDto {
  if (!document) {
    return {
      type,
      status: 'PENDING',
      verificationNote: null,
      verifiedAt: null,
      canReupload: true,
    };
  }
  return {
    type,
    status: document.status,
    verificationNote: document.verificationNote,
    verifiedAt: document.verifiedAt?.toISOString() ?? null,
    canReupload: document.status !== 'VERIFIED',
  };
}

function toKycOverallState(documents: ReadonlyArray<{ type: string; status: string }>): KycOverallState {
  const aadhaar = documents.find((document) => document.type === 'AADHAAR');
  const drivingLicense = documents.find((document) => document.type === 'DRIVING_LICENSE');
  if (
    aadhaar?.status === 'VERIFIED' &&
    drivingLicense?.status === 'VERIFIED'
  ) {
    return 'VERIFIED';
  }
  if (
    aadhaar?.status === 'REJECTED' ||
    drivingLicense?.status === 'REJECTED'
  ) {
    return 'ACTION_REQUIRED';
  }
  const anyUploaded = documents.some(
    (document) =>
      (document.type === 'AADHAAR' || document.type === 'DRIVING_LICENSE') &&
      document.status !== 'PENDING',
  );
  return anyUploaded ? 'AWAITING_REVIEW' : 'INCOMPLETE';
}

function toKycStatusDto(profile: KycProfileRow): KycStatusDto {
  return {
    partnerId: profile.partnerId,
    fullName: profile.fullName,
    branchId: profile.branchId,
    branchName: profile.branch.name,
    overallState: toKycOverallState(profile.documents),
    documents: KYC_DOCUMENT_TYPES.map((type) =>
      toKycDocumentDto(type, profile.documents.find((document) => document.type === type)),
    ),
  };
}

function toKycListItemDto(row: {
  id: string;
  partnerId: string;
  fullName: string;
  mobile: string | null;
  status: string;
  documents: ReadonlyArray<{ type: string; status: string }>;
}): KycListItemDto {
  return {
    partnerId: row.partnerId,
    fullName: row.fullName,
    mobile: row.mobile ?? '',
    status: row.status,
    overallState: toKycOverallState(row.documents),
    hasAadhaar: row.documents.some(
      (document) => document.type === 'AADHAAR' && document.status !== 'PENDING',
    ),
    hasDrivingLicense: row.documents.some(
      (document) => document.type === 'DRIVING_LICENSE' && document.status !== 'PENDING',
    ),
  };
}
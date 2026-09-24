import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashSync } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import type {
  CreateDeliveryPartnerResultDto,
  DeliveryPartnerCandidateDto,
  DeliveryPartnerListItemDto,
  DeliveryPartnerProfileDto,
  UserRole,
} from '@hungrybox/shared';
import type {
  DeliveryAssignmentStatus,
  DocumentType,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client';
import { DeliveryAvailability, UserStatus } from '../../generated/prisma/enums';
import { normalizeLoginId } from '../../common/utils/login-id';
import { DeliveryConflictException } from '../../common/exceptions/delivery-conflict.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import type { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto';
import type { PartnerListQueryDto } from './dto/partner-list-query.dto';
import type { ReviewPartnerDocumentDto } from './dto/review-partner-document.dto';
import type { SetDeliveryPartnerStatusDto } from './dto/set-delivery-partner-status.dto';
import type { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto';
import type { UpsertPartnerDocumentDto } from './dto/upsert-partner-document.dto';
import type { VerifyDeliveryPartnerDto } from './dto/verify-delivery-partner.dto';
import {
  toPartnerCandidateDto,
  toPartnerListItemDto,
  toPartnerProfileDto,
} from './delivery-partner.mapper';
import { PartnerIdService } from './partner-id.service';

export interface PartnerActor {
  role: UserRole;
  branchId: string | null;
  userId: string;
}

const REQUIRED_DOCUMENTS: DocumentType[] = ['AADHAAR', 'ADDRESS_PROOF', 'PAN', 'DRIVING_LICENSE'];
const ACTIVE_ASSIGNMENT_STATUSES: DeliveryAssignmentStatus[] = [
  'ASSIGNED',
  'ACCEPTED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

@Injectable()
export class DeliveryPartnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerIdService: PartnerIdService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: PartnerActor,
    dto: CreateDeliveryPartnerDto,
  ): Promise<CreateDeliveryPartnerResultDto> {
    const db = this.prisma.requireClient();
    const branchId = this.resolveCreateBranch(actor, dto.branchId);
    const loginId = normalizeLoginId(dto.loginId);

    return db.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { loginId } });
      if (existingUser) {
        throw new ConflictException('A user with this login id already exists');
      }

      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true, code: true, city: true },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }

      const password = randomPassword();
      const partnerId = await this.partnerIdService.next(tx);
      const user = await tx.user.create({
        data: {
          loginId,
          passwordHash: hashSync(password),
          role: 'DELIVERY_PARTNER',
          status: UserStatus.ACTIVE,
          branchId: branch.id,
        },
        select: { id: true },
      });
      const profile = await tx.deliveryPartnerProfile.create({
        data: {
          partnerId,
          userId: user.id,
          branchId: branch.id,
          fullName: dto.fullName,
          email: dto.email ?? null,
          mobile: dto.mobile ?? null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender ?? null,
          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
          houseFlat: dto.houseFlat ?? null,
          streetArea: dto.streetArea ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          postalCode: dto.postalCode ?? null,
          vehicleType: dto.vehicleType ?? null,
          vehicleNumber: dto.vehicleNumber ?? null,
          vehicleBrand: dto.vehicleBrand ?? null,
          vehicleModel: dto.vehicleModel ?? null,
          vehicleColour: dto.vehicleColour ?? null,
          ownVehicle: dto.ownVehicle ?? null,
          partnerType: dto.partnerType ?? null,
          status: 'PENDING_VERIFICATION',
          availability: DeliveryAvailability.OFFLINE,
        },
        select: { id: true },
      });

      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.PARTNER_CREATED,
          entityType: 'delivery_partner_profile',
          entityId: profile.id,
          branchId: branch.id,
          message: `Delivery partner created (${partnerId})`,
        },
        tx,
      );

      const full = await tx.deliveryPartnerProfile.findFirstOrThrow({
        where: { id: profile.id },
        include: {
          branch: { select: { id: true, name: true, code: true, city: true } },
          documents: true,
        },
      });
      return {
        profile: toPartnerProfileDto(full, full.documents, 0),
        temporaryPassword: password,
      };
    });
  }

  async list(
    actor: PartnerActor,
    query: PartnerListQueryDto,
  ): Promise<DeliveryPartnerListItemDto[]> {
    const db = this.prisma.requireClient();
    const enforcedBranchId = this.enforcedBranchId(actor);
    const where: Prisma.DeliveryPartnerProfileWhereInput = {};

    if (enforcedBranchId !== null) {
      where.branchId = enforcedBranchId;
    } else if (query.branchId) {
      where.branchId = query.branchId;
    } else if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { partnerId: { contains: query.search } },
      ];
    }
    if (query.search) {
      const or = where.OR ?? [];
      or.push(
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { partnerId: { contains: query.search } },
      );
      where.OR = or;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.availability) {
      where.availability = query.availability;
    }

    const rows = await db.deliveryPartnerProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset ?? 0,
      take: query.limit ?? 50,
      select: {
        id: true,
        partnerId: true,
        fullName: true,
        mobile: true,
        status: true,
        availability: true,
        joinedAt: true,
        latitude: true,
        longitude: true,
        branch: { select: { id: true, name: true, code: true, city: true } },
      },
    });
    const counts = await this.activeDeliveryCounts(rows.map((row) => row.id));

    return rows.map((row) => toPartnerListItemDto(row, counts.get(row.id) ?? 0, null, null));
  }

  async get(actor: PartnerActor, partnerId: string): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await this.requireProfile(db, actor, partnerId);
    const counts = await this.activeDeliveryCounts([profile.id]);
    return toPartnerProfileDto(profile, profile.documents, counts.get(profile.id) ?? 0);
  }

  async update(
    actor: PartnerActor,
    partnerId: string,
    dto: UpdateDeliveryPartnerDto,
  ): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await this.requireProfile(db, actor, partnerId);
    if (profile.status === 'SUSPENDED' || profile.status === 'REJECTED') {
      throw new ConflictException('Cannot edit a suspended or rejected partner');
    }

    const data: Prisma.DeliveryPartnerProfileUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.mobile !== undefined) data.mobile = dto.mobile;
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.emergencyContactName !== undefined)
      data.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactPhone !== undefined)
      data.emergencyContactPhone = dto.emergencyContactPhone;
    if (dto.houseFlat !== undefined) data.houseFlat = dto.houseFlat;
    if (dto.streetArea !== undefined) data.streetArea = dto.streetArea;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.postalCode !== undefined) data.postalCode = dto.postalCode;
    if (dto.vehicleType !== undefined) data.vehicleType = dto.vehicleType;
    if (dto.vehicleNumber !== undefined) data.vehicleNumber = dto.vehicleNumber;
    if (dto.vehicleBrand !== undefined) data.vehicleBrand = dto.vehicleBrand;
    if (dto.vehicleModel !== undefined) data.vehicleModel = dto.vehicleModel;
    if (dto.vehicleColour !== undefined) data.vehicleColour = dto.vehicleColour;
    if (dto.registrationYear !== undefined) data.registrationYear = dto.registrationYear;
    if (dto.insuranceExpiry !== undefined) data.insuranceExpiry = new Date(dto.insuranceExpiry);
    if (dto.ownVehicle !== undefined) data.ownVehicle = dto.ownVehicle;
    if (dto.partnerType !== undefined) data.partnerType = dto.partnerType;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.deliveryPartnerProfile.update({
        where: { id: profile.id },
        data,
        include: {
          branch: { select: { id: true, name: true, code: true, city: true } },
          documents: true,
        },
      });
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.PARTNER_STATUS_CHANGED,
          entityType: 'delivery_partner_profile',
          entityId: row.id,
          branchId: profile.branchId,
          message: 'Partner profile updated',
        },
        tx,
      );
      return row;
    });
    return toPartnerProfileDto(updated, updated.documents, 0);
  }

  async setAccountStatus(
    actor: PartnerActor,
    partnerId: string,
    dto: SetDeliveryPartnerStatusDto,
  ): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await this.requireProfile(db, actor, partnerId);
    if (dto.status === 'ACTIVE') {
      const allowedFrom: DeliveryPartnerProfileDto['status'][] = [
        'ACTIVE',
        'INACTIVE',
        'VERIFIED',
        'SUSPENDED',
      ];
      if (!allowedFrom.includes(profile.status)) {
        throw new ConflictException('Partner must be verified before activation');
      }
    }
    if (dto.status === 'INACTIVE' || dto.status === 'SUSPENDED') {
      if (await this.hasActiveDelivery(profile.id)) {
        throw new DeliveryConflictException(
          'delivery.active_delivery_pending',
          'Partner has an active delivery',
        );
      }
    }

    const availability =
      dto.status === 'INACTIVE' || dto.status === 'SUSPENDED'
        ? DeliveryAvailability.OFFLINE
        : profile.availability;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.deliveryPartnerProfile.update({
        where: { id: profile.id },
        data: { status: dto.status, availability },
        include: {
          branch: { select: { id: true, name: true, code: true, city: true } },
          documents: true,
        },
      });
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.PARTNER_STATUS_CHANGED,
          entityType: 'delivery_partner_profile',
          entityId: row.id,
          branchId: profile.branchId,
          message: `Partner status set to ${dto.status}`,
        },
        tx,
      );
      return row;
    });
    return toPartnerProfileDto(updated, updated.documents, 0);
  }

  async review(
    actor: PartnerActor,
    partnerId: string,
    dto: VerifyDeliveryPartnerDto,
  ): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await this.requireProfile(db, actor, partnerId);

    if (profile.status === 'SUSPENDED' || profile.status === 'REJECTED') {
      throw new ConflictException('Partner is not under verification');
    }

    const data: Prisma.DeliveryPartnerProfileUpdateInput = {};
    switch (dto.action) {
      case 'BEGIN_REVIEW': {
        if (profile.status !== 'PENDING_VERIFICATION') {
          throw new ConflictException('Review already started');
        }
        data.status = 'DOCUMENT_REVIEW';
        break;
      }
      case 'APPROVE': {
        if (profile.status !== 'DOCUMENT_REVIEW' && profile.status !== 'VERIFIED') {
          throw new ConflictException('Partner must be under document review to approve');
        }
        this.assertDocumentsSatisfy(profile.documents);
        data.status = 'VERIFIED';
        data.identityVerified = true;
        data.addressProofVerified = true;
        data.licenceVerified = true;
        break;
      }
      case 'ACTIVATE': {
        if (profile.status !== 'VERIFIED') {
          throw new ConflictException('Partner must be verified before activation');
        }
        data.status = 'ACTIVE';
        if (!profile.joinedAt) {
          data.joinedAt = new Date();
        }
        break;
      }
      case 'REJECT': {
        if (!dto.rejectionReason) {
          throw new BadRequestException('rejectionReason is required to reject a partner');
        }
        if (await this.hasActiveDelivery(profile.id)) {
          throw new DeliveryConflictException(
            'delivery.active_delivery_pending',
            'Cannot reject a partner with an active delivery',
          );
        }
        data.status = 'REJECTED';
        data.rejectionReason = dto.rejectionReason;
        data.availability = DeliveryAvailability.OFFLINE;
        break;
      }
      default:
        throw new BadRequestException('Unknown verify action');
    }

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.deliveryPartnerProfile.update({
        where: { id: profile.id },
        data,
        include: {
          branch: { select: { id: true, name: true, code: true, city: true } },
          documents: true,
        },
      });
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.PARTNER_VERIFIED,
          entityType: 'delivery_partner_profile',
          entityId: row.id,
          branchId: profile.branchId,
          message: `Verification action: ${dto.action}`,
        },
        tx,
      );
      return row;
    });
    const counts = await this.activeDeliveryCounts([updated.id]);
    return toPartnerProfileDto(updated, updated.documents, counts.get(updated.id) ?? 0);
  }

  async upsertDocument(
    actor: PartnerActor,
    partnerId: string,
    dto: UpsertPartnerDocumentDto,
  ): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await this.requireProfile(db, actor, partnerId);
    if (profile.status === 'SUSPENDED' || profile.status === 'REJECTED') {
      throw new ConflictException('Cannot edit documents for a suspended or rejected partner');
    }

    const updated = await db.$transaction(async (tx) => {
      await tx.deliveryPartnerDocument.upsert({
        where: {
          deliveryPartnerId_type: { deliveryPartnerId: profile.id, type: dto.type },
        },
        update: {
          documentReference: dto.documentReference ?? undefined,
          status: dto.documentReference ? 'UPLOADED' : 'PENDING',
          verificationNote: null,
          verifiedAt: null,
          verifiedById: null,
        },
        create: {
          deliveryPartnerId: profile.id,
          type: dto.type,
          documentReference: dto.documentReference ?? null,
          status: dto.documentReference ? 'UPLOADED' : 'PENDING',
        },
      });
      return tx.deliveryPartnerProfile.findFirstOrThrow({
        where: { id: profile.id },
        include: {
          branch: { select: { id: true, name: true, code: true, city: true } },
          documents: true,
        },
      });
    });
    return toPartnerProfileDto(updated, updated.documents, 0);
  }

  async reviewDocument(
    actor: PartnerActor,
    partnerId: string,
    documentId: string,
    dto: ReviewPartnerDocumentDto,
  ): Promise<DeliveryPartnerProfileDto> {
    const db = this.prisma.requireClient();
    const profile = await this.requireProfile(db, actor, partnerId);
    const document = profile.documents.find((doc) => doc.id === documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const updated = await db.$transaction(async (tx) => {
      await tx.deliveryPartnerDocument.update({
        where: { id: document.id },
        data:
          dto.action === 'APPROVE'
            ? {
                status: 'VERIFIED',
                verificationNote: dto.note ?? null,
                verifiedAt: new Date(),
                verifiedById: actor.userId,
              }
            : {
                status: 'REJECTED',
                verificationNote: dto.note ?? null,
                verifiedAt: null,
                verifiedById: null,
              },
      });
      await this.audit.record(
        {
          actorRole: actor.role,
          actorId: actor.userId,
          kind: AuditKinds.DOCUMENT_REVIEWED,
          entityType: 'delivery_partner_document',
          entityId: document.id,
          branchId: profile.branchId,
          message: `Document ${document.type} ${dto.action === 'APPROVE' ? 'approved' : 'rejected'}`,
        },
        tx,
      );
      return tx.deliveryPartnerProfile.findFirstOrThrow({
        where: { id: profile.id },
        include: {
          branch: { select: { id: true, name: true, code: true, city: true } },
          documents: true,
        },
      });
    });
    return toPartnerProfileDto(updated, updated.documents, 0);
  }

  /** Partners eligible to be assigned an order at a branch (used by the assign UI). */
  async listCandidates(
    actor: PartnerActor,
    branchId?: string,
  ): Promise<DeliveryPartnerCandidateDto[]> {
    const db = this.prisma.requireClient();
    const scopeBranchId = this.enforcedBranchId(actor) ?? branchId;
    if (!scopeBranchId) {
      return [];
    }
    const rows = await db.deliveryPartnerProfile.findMany({
      where: { branchId: scopeBranchId, status: 'ACTIVE' },
      orderBy: { availability: 'desc' },
      select: {
        id: true,
        partnerId: true,
        fullName: true,
        status: true,
        availability: true,
        latitude: true,
        longitude: true,
      },
    });
    const counts = await this.activeDeliveryCounts(rows.map((row) => row.id));
    const branch = await db.branch.findUnique({
      where: { id: scopeBranchId },
      select: { latitude: true, longitude: true },
    });
    return rows.map((row) =>
      toPartnerCandidateDto(
        row,
        counts.get(row.id) ?? 0,
        branch?.latitude ?? null,
        branch?.longitude ?? null,
      ),
    );
  }

  /** Branch scope helpers, mirroring BranchOrdersService semantics. */
  enforcedBranchId(actor: PartnerActor): string | null {
    if (actor.role === 'BRANCH_MANAGER') {
      if (!actor.branchId) {
        throw new ConflictException('Branch manager has no assigned branch');
      }
      return actor.branchId;
    }
    return null;
  }

  private resolveCreateBranch(actor: PartnerActor, dtoBranchId?: string): string {
    if (actor.role === 'BRANCH_MANAGER') {
      if (!actor.branchId) {
        throw new ConflictException('Branch manager has no assigned branch');
      }
      return actor.branchId;
    }
    if (!dtoBranchId) {
      throw new BadRequestException('branchId is required when creating partners');
    }
    return dtoBranchId;
  }

  async requireProfile(
    client: PrismaClient | Prisma.TransactionClient,
    actor: PartnerActor,
    partnerId: string,
  ): Promise<PartnerProfileRow> {
    const enforcedBranchId = this.enforcedBranchId(actor);
    const profile = await client.deliveryPartnerProfile.findFirst({
      where: {
        id: partnerId,
        ...(enforcedBranchId !== null ? { branchId: enforcedBranchId } : {}),
      },
      include: partnerProfileInclude,
    });
    if (!profile) {
      throw new NotFoundException('Partner not found');
    }
    return profile;
  }

  async activeDeliveryCounts(partnerIds: string[]): Promise<Map<string, number>> {
    if (partnerIds.length === 0) return new Map();
    const db = this.prisma.requireClient();
    const groups = await db.deliveryAssignment.groupBy({
      by: ['deliveryPartnerId'],
      where: {
        deliveryPartnerId: { in: partnerIds },
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const group of groups) {
      const counted = group._count as { _all: number };
      counts.set(group.deliveryPartnerId, counted._all);
    }
    return counts;
  }

  async hasActiveDelivery(partnerId: string): Promise<boolean> {
    const db = this.prisma.requireClient();
    const found = await db.deliveryAssignment.findFirst({
      where: { deliveryPartnerId: partnerId, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      select: { id: true },
    });
    return found !== null;
  }

  private assertDocumentsSatisfy(
    documents: ReadonlyArray<{ type: DocumentType; status: string }>,
  ): void {
    for (const required of REQUIRED_DOCUMENTS) {
      const doc = documents.find((document) => document.type === required);
      if (!doc || doc.status === 'REJECTED') {
        throw new BadRequestException(`Required document missing or rejected: ${required}`);
      }
    }
  }
}

const partnerProfileInclude = {
  branch: { select: { id: true, name: true, code: true, city: true } },
  documents: true,
} satisfies Prisma.DeliveryPartnerProfileInclude;

export type PartnerProfileRow = Prisma.DeliveryPartnerProfileGetPayload<{
  include: typeof partnerProfileInclude;
}>;

function randomPassword(): string {
  return randomBytes(6).toString('base64url');
}

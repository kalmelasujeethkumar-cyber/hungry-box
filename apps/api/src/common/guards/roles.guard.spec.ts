import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard } from './roles.guard';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makePrisma(
  status: string | null,
  partnerStatus: string | null = 'ACTIVE',
): { prisma: PrismaService; findUnique: Mock; partnerFindUnique: Mock } {
  const findUnique = vi.fn().mockResolvedValue(status === null ? null : { id: 'u1', status });
  const partnerFindUnique = vi
    .fn()
    .mockResolvedValue(partnerStatus === null ? null : { id: 'p1', status: partnerStatus });
  const client = {
    user: { findUnique },
    deliveryPartnerProfile: { findUnique: partnerFindUnique },
  } as unknown as PrismaClient;
  const prisma = { requireClient: () => client } as unknown as PrismaService;
  return { prisma, findUnique, partnerFindUnique };
}

function makeReflector(roles: string[] | undefined): Reflector {
  return { getAllAndOverride: vi.fn().mockReturnValue(roles) } as unknown as Reflector;
}

describe('RolesGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows when no roles are declared, without touching the database', async () => {
    const { prisma, findUnique } = makePrisma(null);
    const guard = new RolesGuard(makeReflector(undefined), prisma);
    await expect(guard.canActivate(makeContext({ user: { role: 'CUSTOMER' } }))).resolves.toBe(
      true,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('allows an active SUPER_ADMIN on a SUPER_ADMIN route', async () => {
    const { prisma } = makePrisma('ACTIVE');
    const guard = new RolesGuard(makeReflector(['SUPER_ADMIN']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'SUPER_ADMIN', sub: 'u1' } })),
    ).resolves.toBe(true);
  });

  it('allows an active BRANCH_MANAGER on a BRANCH_MANAGER route', async () => {
    const { prisma } = makePrisma('ACTIVE');
    const guard = new RolesGuard(makeReflector(['BRANCH_MANAGER']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'BRANCH_MANAGER', sub: 'u1' } })),
    ).resolves.toBe(true);
  });

  it('forbids an already-issued JWT for a suspended SUPER_ADMIN', async () => {
    const { prisma } = makePrisma('SUSPENDED');
    const guard = new RolesGuard(makeReflector(['SUPER_ADMIN']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'SUPER_ADMIN', sub: 'u1' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids an already-issued JWT for an inactive BRANCH_MANAGER', async () => {
    const { prisma } = makePrisma('INACTIVE');
    const guard = new RolesGuard(makeReflector(['BRANCH_MANAGER']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'BRANCH_MANAGER', sub: 'u1' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids a staff JWT whose user no longer exists', async () => {
    const { prisma } = makePrisma(null);
    const guard = new RolesGuard(makeReflector(['SUPER_ADMIN']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'SUPER_ADMIN', sub: 'u1' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids roles that are not permitted, without touching the database', async () => {
    const { prisma, findUnique } = makePrisma('ACTIVE');
    const guard = new RolesGuard(makeReflector(['SUPER_ADMIN']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'BRANCH_MANAGER', sub: 'u1' } })),
    ).rejects.toThrow(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the user is missing', async () => {
    const { prisma } = makePrisma('ACTIVE');
    const guard = new RolesGuard(makeReflector(['SUPER_ADMIN']), prisma);
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(UnauthorizedException);
  });

  it('allows an active DELIVERY_PARTNER on a DELIVERY_PARTNER route', async () => {
    const { prisma } = makePrisma('ACTIVE', 'ACTIVE');
    const guard = new RolesGuard(makeReflector(['DELIVERY_PARTNER']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'DELIVERY_PARTNER', sub: 'u1' } })),
    ).resolves.toBe(true);
  });

  it('forbids an already-issued JWT for a suspended DELIVERY_PARTNER', async () => {
    const { prisma, partnerFindUnique } = makePrisma('ACTIVE', 'SUSPENDED');
    const guard = new RolesGuard(makeReflector(['DELIVERY_PARTNER']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'DELIVERY_PARTNER', sub: 'u1' } })),
    ).rejects.toThrow(ForbiddenException);
    expect(partnerFindUnique).toHaveBeenCalled();
  });

  it('forbids a DELIVERY_PARTNER whose partner profile is missing', async () => {
    const { prisma } = makePrisma('ACTIVE', null);
    const guard = new RolesGuard(makeReflector(['DELIVERY_PARTNER']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'DELIVERY_PARTNER', sub: 'u1' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('keeps CUSTOMER behaviour unchanged (no account status check)', async () => {
    const { prisma, findUnique } = makePrisma('ACTIVE');
    const guard = new RolesGuard(makeReflector(['CUSTOMER']), prisma);
    await expect(
      guard.canActivate(makeContext({ user: { role: 'CUSTOMER', sub: 'u1' } })),
    ).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

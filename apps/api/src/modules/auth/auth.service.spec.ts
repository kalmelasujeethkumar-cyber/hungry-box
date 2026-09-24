import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashSync } from '@node-rs/argon2';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

const gunturActiveManager = {
  id: 'user-manager',
  loginId: 'branch1@gmail.com',
  email: 'branch1@gmail.com',
  name: 'Branch Manager',
  passwordHash: hashSync('654654'),
  role: 'BRANCH_MANAGER',
  status: 'ACTIVE',
  branchId: 'branch-guntur',
} as const;

const suspendedSuperAdmin = {
  id: 'user-suspended',
  loginId: 'admin@gmail.com',
  email: 'admin@gmail.com',
  name: 'Super Admin',
  passwordHash: hashSync('456456'),
  role: 'SUPER_ADMIN',
  status: 'SUSPENDED',
  branchId: null,
} as const;

function buildService(db: Record<string, unknown>) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const jwt = {
    signAsync: vi.fn().mockResolvedValue('signed-token'),
  } as unknown as JwtService;
  return new AuthService(prisma, jwt);
}

describe('AuthService.login', () => {
  it('returns a token and a sanitized user on success', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(gunturActiveManager),
        update: vi.fn().mockResolvedValue(gunturActiveManager),
      },
    };
    const service = buildService(db);

    const result = await service.login({ loginId: 'branch1@gmail.com', password: '654654' });

    expect(result.accessToken).toBe('signed-token');
    expect(result.user).toEqual({
      id: 'user-manager',
      loginId: 'branch1@gmail.com',
      email: 'branch1@gmail.com',
      name: 'Branch Manager',
      role: 'BRANCH_MANAGER',
      status: 'ACTIVE',
      branchId: 'branch-guntur',
    });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-manager' } }),
    );
  });

  it('normalizes the login id before lookup', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(gunturActiveManager),
        update: vi.fn().mockResolvedValue(gunturActiveManager),
      },
    };
    const service = buildService(db);
    await service.login({ loginId: '  BRANCH1@Gmail.com ', password: '654654' });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { loginId: 'branch1@gmail.com' },
    });
  });

  it('rejects a wrong password with a generic message', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(gunturActiveManager),
        update: vi.fn(),
      },
    };
    const service = buildService(db);

    await expect(
      service.login({ loginId: 'branch1@gmail.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid credentials');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects suspended accounts with the same generic message', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(suspendedSuperAdmin),
        update: vi.fn(),
      },
    };
    const service = buildService(db);

    await expect(service.login({ loginId: 'admin@gmail.com', password: '456456' })).rejects.toThrow(
      'Invalid credentials',
    );
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects unknown login ids with the same generic message', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const service = buildService(db);

    await expect(service.login({ loginId: 'nobody@example.com', password: 'x' })).rejects.toThrow(
      'Invalid credentials',
    );
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { loginId: 'nobody@example.com' },
    });
  });
});

describe('AuthService.me', () => {
  it('returns the public profile for an existing user', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(gunturActiveManager),
      },
    };
    const service = buildService(db);
    const result = await service.me('user-manager');
    expect(result.id).toBe('user-manager');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects unknown users', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const service = buildService(db);
    await expect(service.me('missing')).rejects.toThrow(UnauthorizedException);
  });
});

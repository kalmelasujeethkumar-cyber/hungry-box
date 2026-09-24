import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { JwtPayload } from '@hungrybox/shared';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows public routes without a token', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) };
    const jwt = { verifyAsync: vi.fn() };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService, reflector as unknown as Reflector);
    const request = {};
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('attaches the decoded user for protected routes', async () => {
    const payload: JwtPayload = {
      sub: 'user-1',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-guntur',
    };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(payload) };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService, reflector as unknown as Reflector);
    const request = { headers: { authorization: 'Bearer token-123' } };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: { sub: 'user-1', role: 'BRANCH_MANAGER', branchId: 'branch-guntur' },
    });
  });

  it('rejects requests without a bearer token', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const jwt = { verifyAsync: vi.fn() };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService, reflector as unknown as Reflector);
    await expect(guard.canActivate(makeContext({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects tokens that fail verification', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(new Error('bad signature')) };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService, reflector as unknown as Reflector);
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer forged' } })),
    ).rejects.toThrow(UnauthorizedException);
  });
});

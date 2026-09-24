import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows when no roles are declared', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(makeContext({ user: { role: 'CUSTOMER' } }))).toBe(true);
  });

  it('allows when the user role matches', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['SUPER_ADMIN']) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(makeContext({ user: { role: 'SUPER_ADMIN' } }))).toBe(true);
  });

  it('forbids roles that are not permitted', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['SUPER_ADMIN']) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(makeContext({ user: { role: 'BRANCH_MANAGER' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the user is missing', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['SUPER_ADMIN']) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });
});

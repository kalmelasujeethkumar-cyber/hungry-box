import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { BranchScopeGuard } from './branch-scope.guard';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(scopeParam: string | undefined): BranchScopeGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(scopeParam),
  };
  return new BranchScopeGuard(reflector as unknown as Reflector);
}

describe('BranchScopeGuard', () => {
  it('allows when no branch scope is declared', () => {
    const guard = buildGuard(undefined);
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('allows SUPER_ADMIN regardless of the branch', () => {
    const guard = buildGuard('branchId');
    expect(
      guard.canActivate(
        makeContext({
          user: { role: 'SUPER_ADMIN', branchId: null },
          params: { branchId: 'other' },
        }),
      ),
    ).toBe(true);
  });

  it('allows a BRANCH_MANAGER scoped to their own branch from params', () => {
    const guard = buildGuard('branchId');
    expect(
      guard.canActivate(
        makeContext({
          user: { role: 'BRANCH_MANAGER', branchId: 'b1' },
          params: { branchId: 'b1' },
        }),
      ),
    ).toBe(true);
  });

  it('allows a branch check supplied via query params', () => {
    const guard = buildGuard('branchId');
    expect(
      guard.canActivate(
        makeContext({
          user: { role: 'DELIVERY_PARTNER', branchId: 'b1' },
          query: { branchId: 'b1' },
        }),
      ),
    ).toBe(true);
  });

  it('forbids managers touching a different branch', () => {
    const guard = buildGuard('branchId');
    expect(() =>
      guard.canActivate(
        makeContext({ user: { role: 'BRANCH_MANAGER', branchId: 'b1' }, body: { branchId: 'b2' } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('forbids a delivery partner without a branch assignment', () => {
    const guard = buildGuard('branchId');
    expect(() =>
      guard.canActivate(
        makeContext({
          user: { role: 'DELIVERY_PARTNER', branchId: null },
          params: { branchId: 'b1' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('forbids customers from branch control endpoints', () => {
    const guard = buildGuard('branchId');
    expect(() =>
      guard.canActivate(
        makeContext({ user: { role: 'CUSTOMER', branchId: null }, params: { branchId: 'b1' } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('forbids requests without a branch target', () => {
    const guard = buildGuard('branchId');
    expect(() =>
      guard.canActivate(makeContext({ user: { role: 'SUPER_ADMIN', branchId: null } })),
    ).toThrow(ForbiddenException);
  });

  it('rejects when the user is missing', () => {
    const guard = buildGuard('branchId');
    expect(() => guard.canActivate(makeContext({ params: { branchId: 'b1' } }))).toThrow(
      UnauthorizedException,
    );
  });
});

import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from '@hungrybox/shared';

export interface BranchScopedActor {
  role: UserRole;
  branchId: string | null;
  userId: string;
}

/**
 * Authoritative branch scope for a request. A branch manager is always pinned to
 * their assigned branch and may never widen it, so no client-supplied branchId can
 * influence authorization. Returns null for roles with cross-branch access.
 */
export function enforcedBranchId(actor: BranchScopedActor): string | null {
  if (actor.role === 'BRANCH_MANAGER') {
    if (!actor.branchId) {
      throw new ForbiddenException('Branch manager has no assigned branch');
    }
    return actor.branchId;
  }
  return null;
}

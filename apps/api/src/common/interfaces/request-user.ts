import type { UserRole } from '@hungrybox/shared';

export interface RequestUser {
  sub: string;
  role: UserRole;
  branchId: string | null;
}

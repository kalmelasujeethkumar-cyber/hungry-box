import type { AuthUser } from '@hungrybox/shared';
import type { User } from '../../generated/prisma/client';

export function toPublicUser(
  user: Pick<User, 'id' | 'loginId' | 'email' | 'name' | 'role' | 'status' | 'branchId'>,
): AuthUser {
  return {
    id: user.id,
    loginId: user.loginId,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    branchId: user.branchId,
  };
}

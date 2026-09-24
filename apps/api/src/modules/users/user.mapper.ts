import type { AuthUser, UserListItemDto } from '@hungrybox/shared';
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

export interface UserListRow {
  id: string;
  loginId: string;
  email: string | null;
  name: string | null;
  role: User['role'];
  status: User['status'];
  branchId: string | null;
  createdAt: Date;
  branch: { name: string } | null;
}

export function toUserListItem(row: UserListRow): UserListItemDto {
  return {
    id: row.id,
    loginId: row.loginId,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

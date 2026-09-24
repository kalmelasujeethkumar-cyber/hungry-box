import type { UserStatus } from './auth';
import type { UserRole } from './roles';

export interface UserListItemDto {
  id: string;
  loginId: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  branchId: string | null;
  branchName: string | null;
  createdAt: string;
}

export interface UserListQuery {
  role?: UserRole;
  branchId?: string;
  status?: UserStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UserListResultDto {
  items: UserListItemDto[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateManagerInput {
  name: string;
  loginId: string;
  branchId: string;
}

export interface CreateManagerResultDto {
  manager: UserListItemDto;
  temporaryPassword: string;
}

export type ManagerStatus = Exclude<UserStatus, 'PENDING'>;

export interface SetUserStatusInput {
  status: ManagerStatus;
}

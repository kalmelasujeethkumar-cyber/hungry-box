import type { UserRole } from './roles';

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export interface AuthUser {
  id: string;
  loginId: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  branchId: string | null;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  branchId: string | null;
  iat?: number;
  exp?: number;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

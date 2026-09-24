import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { UserListQuery, UserRole, UserStatus } from '@hungrybox/shared';

export class UserListQueryDto implements UserListQuery {
  @IsOptional()
  @IsEnum(['SUPER_ADMIN', 'BRANCH_MANAGER', 'DELIVERY_PARTNER', 'CUSTOMER'] as const)
  role?: UserRole;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'] as const)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

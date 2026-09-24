import { IsEnum } from 'class-validator';
import type { SetUserStatusInput } from '@hungrybox/shared';

export class SetUserStatusDto implements SetUserStatusInput {
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const)
  status!: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

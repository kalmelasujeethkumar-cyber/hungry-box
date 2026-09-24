import { IsEnum } from 'class-validator';
import type { SetBranchStatusInput } from '@hungrybox/shared';

export class SetBranchStatusDto implements SetBranchStatusInput {
  @IsEnum(['ACTIVE', 'PAUSED', 'INACTIVE'] as const)
  status!: 'ACTIVE' | 'PAUSED' | 'INACTIVE';
}

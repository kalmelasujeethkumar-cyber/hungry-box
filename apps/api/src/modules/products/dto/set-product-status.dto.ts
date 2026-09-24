import { IsEnum } from 'class-validator';
import type { SetProductStatusInput } from '@hungrybox/shared';

export class SetProductStatusDto implements SetProductStatusInput {
  @IsEnum(['ACTIVE', 'INACTIVE'] as const)
  status!: 'ACTIVE' | 'INACTIVE';
}

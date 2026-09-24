import { IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateManagerInput } from '@hungrybox/shared';

export class CreateManagerDto implements CreateManagerInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  loginId!: string;

  @IsString()
  @MaxLength(64)
  branchId!: string;
}

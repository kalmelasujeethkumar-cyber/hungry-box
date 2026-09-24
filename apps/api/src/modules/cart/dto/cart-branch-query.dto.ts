import { IsString, MaxLength, MinLength } from 'class-validator';

export class CartBranchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  branchId!: string;
}

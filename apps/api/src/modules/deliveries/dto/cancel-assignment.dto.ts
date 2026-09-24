import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
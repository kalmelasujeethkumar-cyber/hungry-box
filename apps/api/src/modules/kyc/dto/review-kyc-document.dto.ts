import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewKycDocumentDto {
  @IsEnum(['VERIFY', 'REJECT'])
  action!: 'VERIFY' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
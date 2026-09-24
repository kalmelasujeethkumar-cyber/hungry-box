import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewPartnerDocumentDto {
  @IsEnum(['APPROVE', 'REJECT'] as const)
  action!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { DocumentType } from '@hungrybox/shared';

export class UpsertPartnerDocumentDto {
  @IsEnum([
    'AADHAAR',
    'PAN',
    'ADDRESS_PROOF',
    'DRIVING_LICENSE',
    'RC',
    'INSURANCE',
    'BANK_PROOF',
    'PROFILE_PHOTO',
  ] as const)
  type!: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentReference?: string;
}
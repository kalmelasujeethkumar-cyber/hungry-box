import type { PrivateDocumentFormat } from './private-document-validator';

export const MAX_PRIVATE_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const PRIVATE_DOCUMENT_ACCESS_TTL_MS = 5 * 60 * 1000;

export const KYC_STORAGE_FOLDER = 'hungry-box/kyc';

export const PRIVATE_KYC_STORAGE_PROVIDER = Symbol('PRIVATE_KYC_STORAGE_PROVIDER');

export interface PrivateDocumentFile {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
}

export interface StoredPrivateDocument {
  publicId: string;
  resourceType: string;
  format: PrivateDocumentFormat;
  fileSize: number;
}

export interface UploadPrivateDocumentParams {
  buffer: Buffer;
  folder: string;
  publicId: string;
  format: PrivateDocumentFormat;
}

export interface PrivateDocumentAccess {
  url: string;
  expiresAt: string;
}

export interface PrivateDocumentStorageProvider {
  uploadPrivateDocument(params: UploadPrivateDocumentParams): Promise<StoredPrivateDocument>;
  deletePrivateDocument(publicId: string): Promise<void>;
  generatePrivateDocumentAccess(params: {
    publicId: string;
    format: PrivateDocumentFormat;
  }): Promise<PrivateDocumentAccess>;
}
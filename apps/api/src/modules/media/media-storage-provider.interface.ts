export const MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024;

export const MEDIA_STORAGE_PROVIDER = Symbol('MEDIA_STORAGE_PROVIDER');

export interface PublicImageFile {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
}

export interface StoredPublicImage {
  secureUrl: string;
  publicId: string;
  resourceType: string;
}

export interface UploadPublicImageParams {
  buffer: Buffer;
  folder: string;
  publicId: string;
}

export interface MediaStorageProvider {
  uploadPublicImage(params: UploadPublicImageParams): Promise<StoredPublicImage>;
  deletePublicImage(publicId: string): Promise<void>;
}

import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import {
  PRIVATE_DOCUMENT_ACCESS_TTL_MS,
} from './private-document-storage.interface';
import type {
  PrivateDocumentAccess,
  PrivateDocumentStorageProvider,
  StoredPrivateDocument,
  UploadPrivateDocumentParams,
} from './private-document-storage.interface';
import type { PrivateDocumentFormat } from './private-document-validator';

function toDeliveryFormat(format: PrivateDocumentFormat): string {
  return format === 'jpeg' ? 'jpg' : 'png';
}

@Injectable()
export class CloudinaryPrivateDocumentStorageProvider implements PrivateDocumentStorageProvider {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  uploadPrivateDocument({
    buffer,
    folder,
    publicId,
    format,
  }: UploadPrivateDocumentParams): Promise<StoredPrivateDocument> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, public_id: publicId, resource_type: 'image', type: 'authenticated' },
        (error, result) => {
          if (error || !result) {
            reject(new Error(error?.message ?? 'Private document upload failed'));
            return;
          }
          resolve({
            publicId: result.public_id,
            resourceType: result.resource_type ?? 'image',
            format,
            fileSize: buffer.length,
          });
        },
      );
      stream.end(buffer);
    });
  }

  async deletePrivateDocument(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated' });
  }

  async generatePrivateDocumentAccess({
    publicId,
    format,
  }: {
    publicId: string;
    format: PrivateDocumentFormat;
  }): Promise<PrivateDocumentAccess> {
    const expiresAt = new Date(Date.now() + PRIVATE_DOCUMENT_ACCESS_TTL_MS);
    const url = cloudinary.utils.private_download_url(publicId, toDeliveryFormat(format), {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
    return { url, expiresAt: expiresAt.toISOString() };
  }
}
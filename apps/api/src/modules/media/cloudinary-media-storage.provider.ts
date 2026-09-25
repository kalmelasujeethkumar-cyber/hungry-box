import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type {
  MediaStorageProvider,
  StoredPublicImage,
  UploadPublicImageParams,
} from './media-storage-provider.interface';

const TRANSFORM_OPTIONS = { width: 800, crop: 'limit', f_auto: true, q_auto: true } as const;

@Injectable()
export class CloudinaryMediaStorageProvider implements MediaStorageProvider {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  uploadPublicImage({
    buffer,
    folder,
    publicId,
  }: UploadPublicImageParams): Promise<StoredPublicImage> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, public_id: publicId, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            reject(new Error(error?.message ?? 'Image upload failed'));
            return;
          }
          resolve({
            secureUrl: cloudinary.url(result.public_id, { secure: true, ...TRANSFORM_OPTIONS }),
            publicId: result.public_id,
            resourceType: result.resource_type ?? 'image',
          });
        },
      );
      stream.end(buffer);
    });
  }

  async deletePublicImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}

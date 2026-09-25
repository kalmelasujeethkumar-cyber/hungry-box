import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  MediaStorageProvider,
  StoredPublicImage,
  UploadPublicImageParams,
} from './media-storage-provider.interface';

@Injectable()
export class UnavailableMediaStorageProvider implements MediaStorageProvider {
  async uploadPublicImage(params: UploadPublicImageParams): Promise<StoredPublicImage> {
    void params;
    throw new ServiceUnavailableException('Image storage is not configured for this environment');
  }

  async deletePublicImage(publicId: string): Promise<void> {
    void publicId;
    throw new ServiceUnavailableException('Image storage is not configured for this environment');
  }
}

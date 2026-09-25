import { Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryMediaStorageProvider } from './cloudinary-media-storage.provider';
import type { MediaStorageProvider } from './media-storage-provider.interface';
import { MEDIA_STORAGE_PROVIDER } from './media-storage-provider.interface';
import { UnavailableMediaStorageProvider } from './unavailable-media-storage.provider';

export function resolveMediaStorageProvider(config: ConfigService): MediaStorageProvider {
  const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
  const apiKey = config.get<string>('CLOUDINARY_API_KEY');
  const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
  if (cloudName && apiKey && apiSecret) {
    return new CloudinaryMediaStorageProvider(config);
  }
  return new UnavailableMediaStorageProvider();
}

const mediaStorageProviderFactory: Provider = {
  provide: MEDIA_STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => resolveMediaStorageProvider(config),
};

@Module({
  providers: [mediaStorageProviderFactory],
  exports: [MEDIA_STORAGE_PROVIDER],
})
export class MediaModule {}

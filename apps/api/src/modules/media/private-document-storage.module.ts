import { Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryPrivateDocumentStorageProvider } from './cloudinary-private-document-storage.provider';
import { PRIVATE_KYC_STORAGE_PROVIDER } from './private-document-storage.interface';
import type { PrivateDocumentStorageProvider } from './private-document-storage.interface';
import { UnavailablePrivateDocumentStorageProvider } from './unavailable-private-document-storage.provider';

export function resolvePrivateKycStorageProvider(
  config: ConfigService,
): PrivateDocumentStorageProvider {
  const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
  const apiKey = config.get<string>('CLOUDINARY_API_KEY');
  const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
  if (cloudName && apiKey && apiSecret) {
    return new CloudinaryPrivateDocumentStorageProvider(config);
  }
  return new UnavailablePrivateDocumentStorageProvider();
}

const privateKycStorageProviderFactory: Provider = {
  provide: PRIVATE_KYC_STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => resolvePrivateKycStorageProvider(config),
};

@Module({
  providers: [privateKycStorageProviderFactory],
  exports: [PRIVATE_KYC_STORAGE_PROVIDER],
})
export class PrivateDocumentStorageModule {}
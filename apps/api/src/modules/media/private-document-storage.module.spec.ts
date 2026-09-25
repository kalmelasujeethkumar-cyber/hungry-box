import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { CloudinaryPrivateDocumentStorageProvider } from './cloudinary-private-document-storage.provider';
import { resolvePrivateKycStorageProvider } from './private-document-storage.module';
import { UnavailablePrivateDocumentStorageProvider } from './unavailable-private-document-storage.provider';

function configStub(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('PrivateDocumentStorageModule provider selection', () => {
  it('selects the Cloudinary provider when all credentials are present', () => {
    const provider = resolvePrivateKycStorageProvider(
      configStub({
        CLOUDINARY_CLOUD_NAME: 'hungrybox',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
    );

    expect(provider).toBeInstanceOf(CloudinaryPrivateDocumentStorageProvider);
  });

  it('selects the unavailable provider when any credential is missing', () => {
    const missingEach = [
      { CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' },
      { CLOUDINARY_CLOUD_NAME: 'hungrybox', CLOUDINARY_API_SECRET: 'secret' },
      { CLOUDINARY_CLOUD_NAME: 'hungrybox', CLOUDINARY_API_KEY: 'key' },
    ];
    for (const values of missingEach) {
      expect(resolvePrivateKycStorageProvider(configStub(values))).toBeInstanceOf(
        UnavailablePrivateDocumentStorageProvider,
      );
    }
  });

  it('the unavailable provider fails clearly when a KYC document op is attempted', async () => {
    const provider = new UnavailablePrivateDocumentStorageProvider();
    await expect(
      provider.uploadPrivateDocument({
        buffer: Buffer.from('x'),
        folder: 'hungry-box/kyc',
        publicId: 'p',
        format: 'jpeg',
      }),
    ).rejects.toThrow(/not configured/i);
    await expect(provider.deletePrivateDocument('p')).rejects.toThrow(/not configured/i);
    await expect(
      provider.generatePrivateDocumentAccess({ publicId: 'p', format: 'png' }),
    ).rejects.toThrow(/not configured/i);
  });
});
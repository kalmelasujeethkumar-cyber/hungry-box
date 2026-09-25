import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { CloudinaryMediaStorageProvider } from './cloudinary-media-storage.provider';
import { resolveMediaStorageProvider } from './media-storage.module';
import { UnavailableMediaStorageProvider } from './unavailable-media-storage.provider';

function configStub(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('MediaModule provider selection', () => {
  it('selects the Cloudinary provider when all credentials are present', () => {
    const provider = resolveMediaStorageProvider(
      configStub({
        CLOUDINARY_CLOUD_NAME: 'hungrybox',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
    );

    expect(provider).toBeInstanceOf(CloudinaryMediaStorageProvider);
  });

  it('selects the unavailable provider when any credential is missing', () => {
    const missingEach = [
      { CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' },
      { CLOUDINARY_CLOUD_NAME: 'hungrybox', CLOUDINARY_API_SECRET: 'secret' },
      { CLOUDINARY_CLOUD_NAME: 'hungrybox', CLOUDINARY_API_KEY: 'key' },
    ];
    for (const values of missingEach) {
      expect(resolveMediaStorageProvider(configStub(values))).toBeInstanceOf(
        UnavailableMediaStorageProvider,
      );
    }
  });

  it('the unavailable provider fails clearly when an image op is attempted', async () => {
    const provider = new UnavailableMediaStorageProvider();
    await expect(
      provider.uploadPublicImage({ buffer: Buffer.from('x'), folder: 'f', publicId: 'p' }),
    ).rejects.toThrow(/not configured/i);
    await expect(provider.deletePublicImage('p')).rejects.toThrow(/not configured/i);
  });
});

import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryMediaStorageProvider } from './cloudinary-media-storage.provider';

const SAMPLE_RESULT = {
  public_id: 'hungry-box/catalog/products/p1/sample',
  secure_url: 'https://cdn.example/sample.jpg',
  resource_type: 'image',
};

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    url: vi.fn(
      (publicId: string) => `https://res.cloudinary.com/hungrybox/image/upload/q_auto/${publicId}`,
    ),
    uploader: {
      upload_stream: vi.fn(),
      destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}));

type UploadCallback = (error: Error | null, result?: unknown) => void;

function streamImpl(handler?: (callback: UploadCallback) => void) {
  return ((_options: unknown, callback: UploadCallback) => ({
    end: () => {
      if (handler) {
        handler(callback);
      } else {
        callback(null, SAMPLE_RESULT);
      }
    },
  })) as unknown as typeof cloudinary.uploader.upload_stream;
}

function configStub(values: Record<string, string>) {
  return { get: (key: string) => values[key] ?? undefined } as unknown as ConfigService;
}

beforeEach(() => {
  vi.mocked(cloudinary.uploader.upload_stream).mockReset();
  vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(streamImpl());
  vi.mocked(cloudinary.uploader.destroy).mockReset();
  vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({ result: 'ok' });
});

describe('CloudinaryMediaStorageProvider', () => {
  it('configures the SDK from the ConfigService', () => {
    new CloudinaryMediaStorageProvider(
      configStub({
        CLOUDINARY_CLOUD_NAME: 'hungrybox',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
    );

    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'hungrybox',
      api_key: 'key',
      api_secret: 'secret',
    });
  });

  it('uploads a buffer and returns an optimized, transformed URL', async () => {
    const provider = new CloudinaryMediaStorageProvider(configStub({}));
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);

    const stored = await provider.uploadPublicImage({
      buffer,
      folder: 'hungry-box/catalog/products/p1',
      publicId: 'abc-123',
    });

    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      { folder: 'hungry-box/catalog/products/p1', public_id: 'abc-123', resource_type: 'image' },
      expect.any(Function),
    );
    expect(stored).toEqual({
      secureUrl:
        'https://res.cloudinary.com/hungrybox/image/upload/q_auto/hungry-box/catalog/products/p1/sample',
      publicId: SAMPLE_RESULT.public_id,
      resourceType: 'image',
    });
  });

  it('rejects when Cloudinary reports an upload error', async () => {
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementationOnce(
      streamImpl((callback) => callback(new Error('cloud boom'))),
    );
    const provider = new CloudinaryMediaStorageProvider(configStub({}));

    await expect(
      provider.uploadPublicImage({ buffer: Buffer.from('x'), folder: 'f', publicId: 'p' }),
    ).rejects.toThrow('cloud boom');
  });

  it('deletes an asset by public id', async () => {
    const provider = new CloudinaryMediaStorageProvider(configStub({}));

    await provider.deletePublicImage('hungry-box/catalog/categories/c1/old');

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'hungry-box/catalog/categories/c1/old',
    );
  });
});

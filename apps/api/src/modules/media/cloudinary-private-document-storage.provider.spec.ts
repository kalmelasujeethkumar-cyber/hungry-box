import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryPrivateDocumentStorageProvider } from './cloudinary-private-document-storage.provider';

const SAMPLE_RESULT = {
  public_id: 'hungry-box/kyc/some-uuid',
  resource_type: 'image',
};

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    utils: {
      private_download_url: vi.fn(
        (publicId: string, format: string) =>
          `https://res.cloudinary.com/hungrybox/private/${format}/${publicId}`,
      ),
    },
    uploader: {
      upload_stream: vi.fn(),
      destroy: vi.fn(),
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
  vi.mocked(cloudinary.utils.private_download_url).mockReset();
  vi.mocked(cloudinary.utils.private_download_url).mockImplementation(
    (publicId: string, format: string) =>
      `https://res.cloudinary.com/hungrybox/private/${format}/${publicId}`,
  );
});

describe('CloudinaryPrivateDocumentStorageProvider', () => {
  it('configures the SDK from the ConfigService', () => {
    new CloudinaryPrivateDocumentStorageProvider(
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

  it('uploads an authenticated, private asset and returns opaque metadata', async () => {
    const provider = new CloudinaryPrivateDocumentStorageProvider(configStub({}));
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);

    const stored = await provider.uploadPrivateDocument({
      buffer,
      folder: 'hungry-box/kyc',
      publicId: 'abc-123',
      format: 'jpeg',
    });

    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      {
        folder: 'hungry-box/kyc',
        public_id: 'abc-123',
        resource_type: 'image',
        type: 'authenticated',
      },
      expect.any(Function),
    );
    expect(stored).toEqual({
      publicId: SAMPLE_RESULT.public_id,
      resourceType: 'image',
      format: 'jpeg',
      fileSize: buffer.length,
    });
  });

  it('rejects when Cloudinary reports an upload error', async () => {
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementationOnce(
      streamImpl((callback) => callback(new Error('cloud boom'))),
    );
    const provider = new CloudinaryPrivateDocumentStorageProvider(configStub({}));

    await expect(
      provider.uploadPrivateDocument({
        buffer: Buffer.from('x'),
        folder: 'hungry-box/kyc',
        publicId: 'p',
        format: 'png',
      }),
    ).rejects.toThrow('cloud boom');
  });

  it('deletes an authenticated asset by public id', async () => {
    const provider = new CloudinaryPrivateDocumentStorageProvider(configStub({}));

    await provider.deletePrivateDocument('hungry-box/kyc/old');

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('hungry-box/kyc/old', {
      resource_type: 'image',
      type: 'authenticated',
    });
  });

  it('generates a short-lived signed access URL with the correct delivery format', async () => {
    vi.mocked(cloudinary.utils.private_download_url).mockReturnValue(
      'https://res.cloudinary.com/hungrybox/private/jpg/hungry-box/kyc/id?signature=s',
    );
    const provider = new CloudinaryPrivateDocumentStorageProvider(configStub({}));
    const before = Date.now();

    const access = await provider.generatePrivateDocumentAccess({
      publicId: 'hungry-box/kyc/id',
      format: 'jpeg',
    });

    const normalized = Math.floor(Date.now() / 1000) - Math.floor(before / 1000);
    expect(cloudinary.utils.private_download_url).toHaveBeenCalledWith(
      'hungry-box/kyc/id',
      'jpg',
      expect.objectContaining({
        resource_type: 'image',
        type: 'authenticated',
      }),
    );
    const options = vi.mocked(cloudinary.utils.private_download_url).mock.calls[0]?.[2] as {
      expires_at: number;
    };
    expect(options.expires_at).toBeGreaterThan(Math.floor(before / 1000));
    expect(normalized).toBeLessThanOrEqual(1);
    expect(access.url).toContain('signature=');
    expect(access.expiresAt).toBeTruthy();
  });

  it('maps png to the png delivery format', async () => {
    const provider = new CloudinaryPrivateDocumentStorageProvider(configStub({}));

    await provider.generatePrivateDocumentAccess({
      publicId: 'hungry-box/kyc/id',
      format: 'png',
    });

    expect(vi.mocked(cloudinary.utils.private_download_url).mock.calls[0]?.[1]).toBe('png');
  });
});
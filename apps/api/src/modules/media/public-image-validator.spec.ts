import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_PUBLIC_IMAGE_BYTES, PublicImageFile } from './media-storage-provider.interface';
import { detectImageType, validatePublicImage } from './public-image-validator';

function fileOf(buffer: Buffer, mimetype = 'image/png'): PublicImageFile {
  return { buffer, mimetype, originalname: 'photo' };
}

describe('detectImageType', () => {
  it('detects JPEG magic bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpeg');
  });

  it('detects PNG magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectImageType(png)).toBe('png');
  });

  it('detects WebP magic bytes', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    expect(detectImageType(webp)).toBe('webp');
  });

  it('rejects SVG and arbitrary bytes', () => {
    expect(detectImageType(Buffer.from('<svg xmlns=...></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from([0, 1, 2, 3, 4]))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('validatePublicImage', () => {
  it('accepts JPEG, PNG and WebP within the size limit', () => {
    expect(validatePublicImage(fileOf(Buffer.from([0xff, 0xd8, 0xff])))).toBe('jpeg');
    expect(
      validatePublicImage(fileOf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))),
    ).toBe('png');
    expect(
      validatePublicImage(
        fileOf(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])),
      ),
    ).toBe('webp');
  });

  it('rejects an empty or missing buffer', () => {
    expect(() => validatePublicImage(fileOf(Buffer.alloc(0)))).toThrow(BadRequestException);
    expect(() => validatePublicImage({} as PublicImageFile)).toThrow(BadRequestException);
    expect(() => validatePublicImage(undefined as unknown as PublicImageFile)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a payload larger than the limit', () => {
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(MAX_PUBLIC_IMAGE_BYTES),
    ]);
    expect(() => validatePublicImage(fileOf(big))).toThrow(BadRequestException);
  });

  it('rejects arbitrary content even when it claims an image mimetype', () => {
    expect(() => validatePublicImage(fileOf(Buffer.from('GIF89a....'), 'image/gif'))).toThrow(
      BadRequestException,
    );
  });
});

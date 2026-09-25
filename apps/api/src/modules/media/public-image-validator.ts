import { BadRequestException } from '@nestjs/common';
import { MAX_PUBLIC_IMAGE_BYTES, PublicImageFile } from './media-storage-provider.interface';

export type SupportedImageType = 'jpeg' | 'png' | 'webp';

export function detectImageType(buffer: Buffer): SupportedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= png.length && buffer.subarray(0, png.length).equals(png)) {
    return 'png';
  }
  const webp = 'WEBP';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === webp
  ) {
    return 'webp';
  }
  return null;
}

export function validatePublicImage(file: PublicImageFile): SupportedImageType {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new BadRequestException('Image file is required');
  }
  if (file.buffer.length > MAX_PUBLIC_IMAGE_BYTES) {
    throw new BadRequestException('Image exceeds the 5 MB limit');
  }
  const type = detectImageType(file.buffer);
  if (!type) {
    throw new BadRequestException('Unsupported image type. Allowed: JPEG, PNG, WebP');
  }
  return type;
}

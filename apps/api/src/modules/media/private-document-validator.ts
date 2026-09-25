import { BadRequestException } from '@nestjs/common';
import { MAX_PRIVATE_DOCUMENT_BYTES, PrivateDocumentFile } from './private-document-storage.interface';

export type PrivateDocumentFormat = 'jpeg' | 'png';

export function detectPrivateDocumentFormat(buffer: Buffer): PrivateDocumentFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= png.length && buffer.subarray(0, png.length).equals(png)) {
    return 'png';
  }
  return null;
}

export function validatePrivateKycDocument(
  file: PrivateDocumentFile | undefined,
): PrivateDocumentFormat {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new BadRequestException('A document image is required');
  }
  if (file.buffer.length > MAX_PRIVATE_DOCUMENT_BYTES) {
    throw new BadRequestException('Document images must be 5 MB or smaller');
  }
  const format = detectPrivateDocumentFormat(file.buffer);
  if (!format) {
    throw new BadRequestException('Only JPEG and PNG document images are allowed');
  }
  return format;
}
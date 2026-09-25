import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_PRIVATE_DOCUMENT_BYTES, PrivateDocumentFile } from './private-document-storage.interface';
import { detectPrivateDocumentFormat, validatePrivateKycDocument } from './private-document-validator';

function fileOf(buffer: Buffer, mimetype = 'image/png'): PrivateDocumentFile {
  return { buffer, mimetype, originalname: 'document' };
}

describe('detectPrivateDocumentFormat', () => {
  it('detects JPEG magic bytes', () => {
    expect(detectPrivateDocumentFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpeg');
  });

  it('detects PNG magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectPrivateDocumentFormat(png)).toBe('png');
  });

  it('rejects WebP, PDF, SVG and arbitrary bytes', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    expect(detectPrivateDocumentFormat(webp)).toBeNull();
    expect(detectPrivateDocumentFormat(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectPrivateDocumentFormat(Buffer.from('<svg xmlns=...></svg>'))).toBeNull();
    expect(detectPrivateDocumentFormat(Buffer.from([0, 1, 2, 3, 4]))).toBeNull();
    expect(detectPrivateDocumentFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('validatePrivateKycDocument', () => {
  it('accepts JPEG and PNG within the size limit', () => {
    expect(validatePrivateKycDocument(fileOf(Buffer.from([0xff, 0xd8, 0xff])))).toBe('jpeg');
    expect(
      validatePrivateKycDocument(
        fileOf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      ),
    ).toBe('png');
  });

  it('rejects an empty or missing buffer', () => {
    expect(() => validatePrivateKycDocument(fileOf(Buffer.alloc(0)))).toThrow(BadRequestException);
    expect(() => validatePrivateKycDocument({} as PrivateDocumentFile)).toThrow(
      BadRequestException,
    );
    expect(() => validatePrivateKycDocument(undefined as unknown as PrivateDocumentFile)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a payload larger than the limit', () => {
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(MAX_PRIVATE_DOCUMENT_BYTES),
    ]);
    expect(() => validatePrivateKycDocument(fileOf(big))).toThrow(BadRequestException);
  });

  it('rejects arbitrary content even when it claims an image mimetype', () => {
    expect(() => validatePrivateKycDocument(fileOf(Buffer.from('GIF89a....'), 'image/gif'))).toThrow(
      BadRequestException,
    );
    expect(() => validatePrivateKycDocument(fileOf(Buffer.from('%PDF-1.7'), 'application/pdf'))).toThrow(
      BadRequestException,
    );
  });
});
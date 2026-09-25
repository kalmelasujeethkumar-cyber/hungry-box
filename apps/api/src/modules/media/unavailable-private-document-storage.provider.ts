import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  PrivateDocumentAccess,
  PrivateDocumentStorageProvider,
  StoredPrivateDocument,
  UploadPrivateDocumentParams,
} from './private-document-storage.interface';

@Injectable()
export class UnavailablePrivateDocumentStorageProvider implements PrivateDocumentStorageProvider {
  async uploadPrivateDocument(params: UploadPrivateDocumentParams): Promise<StoredPrivateDocument> {
    void params;
    throw new ServiceUnavailableException(
      'Private KYC document storage is not configured for this environment',
    );
  }

  async deletePrivateDocument(publicId: string): Promise<void> {
    void publicId;
    throw new ServiceUnavailableException(
      'Private KYC document storage is not configured for this environment',
    );
  }

  async generatePrivateDocumentAccess(options: {
    publicId: string;
    format: 'jpeg' | 'png';
  }): Promise<PrivateDocumentAccess> {
    void options;
    throw new ServiceUnavailableException(
      'Private KYC document storage is not configured for this environment',
    );
  }
}
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KycStatusDto } from '@hungrybox/shared';
import PartnerKycCard from './PartnerKycCard';

const MOCK_AUTH = vi.hoisted(() => ({
  user: {
    id: 'dp-user-1',
    loginId: 'shiva@',
    email: null,
    name: 'Shiva Kumar',
    role: 'DELIVERY_PARTNER' as const,
    status: 'ACTIVE',
    branchId: 'br-guntur',
  },
  token: 'test-token',
  initializing: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

const MOCK_APIS = vi.hoisted(() => ({
  deliveryPartnerApi: {
    kycStatus: vi.fn(),
    kycUploadDocument: vi.fn(),
    kycDocumentAccess: vi.fn(),
  },
}));

vi.mock('../../api/client', () => MOCK_APIS);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));

const KYC_INCOMPLETE: KycStatusDto = {
  partnerId: 'HB-DP-000001',
  fullName: 'Shiva Kumar',
  branchId: 'br-guntur',
  branchName: 'Guntur',
  overallState: 'INCOMPLETE',
  documents: [
    { type: 'AADHAAR', status: 'PENDING', verificationNote: null, verifiedAt: null, canReupload: true },
    { type: 'DRIVING_LICENSE', status: 'PENDING', verificationNote: null, verifiedAt: null, canReupload: true },
  ],
};

const KYC_WITH_UPLOADED: KycStatusDto = {
  ...KYC_INCOMPLETE,
  overallState: 'AWAITING_REVIEW',
  documents: [
    { type: 'AADHAAR', status: 'UPLOADED', verificationNote: null, verifiedAt: null, canReupload: true },
    { type: 'DRIVING_LICENSE', status: 'PENDING', verificationNote: null, verifiedAt: null, canReupload: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.deliveryPartnerApi.kycStatus.mockResolvedValue(KYC_INCOMPLETE);
});

describe('PartnerKycCard', () => {
  it('shows the overall state and per-document statuses', async () => {
    render(<PartnerKycCard />);

    expect(await screen.findByText('KYC incomplete')).toBeInTheDocument();
    expect(screen.getByText('Aadhaar')).toBeInTheDocument();
    expect(screen.getByText('Driving licence')).toBeInTheDocument();
    expect(screen.getAllByText('Not uploaded').length).toBe(2);
  });

  it('rejects non-image files client-side before upload', async () => {
    render(<PartnerKycCard />);

    await screen.findByText('KYC incomplete');
    const [aadhaarInput] = screen.getAllByLabelText('Upload');
    const pdf = new File(['not an image'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(aadhaarInput, { target: { files: [pdf] } });

    expect(await screen.findByText('Only JPEG and PNG document images are allowed.')).toBeInTheDocument();
    expect(MOCK_APIS.deliveryPartnerApi.kycUploadDocument).not.toHaveBeenCalled();
  });

  it('rejects documents larger than 5 MB before upload', async () => {
    const user = userEvent.setup();
    render(<PartnerKycCard />);

    await screen.findByText('KYC incomplete');
    const [aadhaarInput] = screen.getAllByLabelText('Upload');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(aadhaarInput, big);

    expect(await screen.findByText('Documents must be 5 MB or smaller.')).toBeInTheDocument();
    expect(MOCK_APIS.deliveryPartnerApi.kycUploadDocument).not.toHaveBeenCalled();
  });

  it('uploads an Aadhaar JPEG and refreshes the status', async () => {
    MOCK_APIS.deliveryPartnerApi.kycUploadDocument.mockResolvedValue(KYC_WITH_UPLOADED);
    const user = userEvent.setup();
    render(<PartnerKycCard />);

    await screen.findByText('KYC incomplete');
    const [aadhaarInput] = screen.getAllByLabelText('Upload');
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'aadhaar.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(aadhaarInput, file);

    await waitFor(() =>
      expect(MOCK_APIS.deliveryPartnerApi.kycUploadDocument).toHaveBeenCalledWith(
        'AADHAAR',
        file,
        'test-token',
      ),
    );
    expect(await screen.findByText('KYC awaiting review')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('surfaces an upload failure from the API', async () => {
    MOCK_APIS.deliveryPartnerApi.kycUploadDocument.mockRejectedValue(
      new Error('Only JPEG and PNG are supported.'),
    );
    const user = userEvent.setup();
    render(<PartnerKycCard />);

    await screen.findByText('KYC incomplete');
    const [aadhaarInput] = screen.getAllByLabelText('Upload');
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'aadhaar.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(aadhaarInput, file);

    expect(await screen.findByText('Only JPEG and PNG are supported.')).toBeInTheDocument();
  });

  it('shows the rejection note when a document was rejected', async () => {
    MOCK_APIS.deliveryPartnerApi.kycStatus.mockResolvedValue({
      ...KYC_INCOMPLETE,
      overallState: 'ACTION_REQUIRED',
      documents: [
        {
          type: 'AADHAAR',
          status: 'REJECTED',
          verificationNote: 'Image is blurry, please re-upload.',
          verifiedAt: null,
          canReupload: true,
        },
        { type: 'DRIVING_LICENSE', status: 'PENDING', verificationNote: null, verifiedAt: null, canReupload: true },
      ],
    });
    render(<PartnerKycCard />);

    expect(
      await screen.findByText('Reason: Image is blurry, please re-upload.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Re-upload')).toBeInTheDocument();
  });
});
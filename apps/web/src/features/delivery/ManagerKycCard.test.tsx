import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KycStatusDto } from '@hungrybox/shared';
import ManagerKycCard from './ManagerKycCard';

const MOCK_AUTH = vi.hoisted(() => ({
  user: {
    id: 'mgr-1',
    loginId: 'branch1@gmail.com',
    email: 'branch1@gmail.com',
    name: 'Branch Manager',
    role: 'BRANCH_MANAGER' as const,
    status: 'ACTIVE',
    branchId: 'br-guntur',
  },
  token: 'test-token',
  initializing: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

const MOCK_APIS = vi.hoisted(() => ({
  branchKycApi: { get: vi.fn(), documentAccess: vi.fn(), review: vi.fn() },
}));

vi.mock('../../api/client', () => MOCK_APIS);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));

const KYC_AWAITING: KycStatusDto = {
  partnerId: 'HB-DP-000001',
  fullName: 'Shiva Kumar',
  branchId: 'br-guntur',
  branchName: 'Guntur',
  overallState: 'AWAITING_REVIEW',
  documents: [
    { type: 'AADHAAR', status: 'UPLOADED', verificationNote: null, verifiedAt: null, canReupload: true },
    { type: 'DRIVING_LICENSE', status: 'UPLOADED', verificationNote: null, verifiedAt: null, canReupload: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.branchKycApi.get.mockResolvedValue(KYC_AWAITING);
});

describe('ManagerKycCard', () => {
  it('loads the partner KYC and offers verify and view actions', async () => {
    render(<ManagerKycCard partnerId="dp-1" />);

    expect(await screen.findByText('KYC awaiting review')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Verify' }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'View' }).length).toBe(2);
    expect(MOCK_APIS.branchKycApi.get).toHaveBeenCalledWith('dp-1', 'test-token');
  });

  it('verifies an uploaded document', async () => {
    MOCK_APIS.branchKycApi.review.mockResolvedValue(KYC_AWAITING);
    const user = userEvent.setup();
    render(<ManagerKycCard partnerId="dp-1" />);

    await screen.findByText('KYC review');
    await user.click(screen.getAllByRole('button', { name: 'Verify' })[0]);

    await waitFor(() =>
      expect(MOCK_APIS.branchKycApi.review).toHaveBeenCalledWith(
        'dp-1',
        'AADHAAR',
        { action: 'VERIFY', note: undefined },
        'test-token',
      ),
    );
  });

  it('requires a reason before rejecting a document', async () => {
    const user = userEvent.setup();
    render(<ManagerKycCard partnerId="dp-1" />);

    await screen.findByText('KYC review');
    await user.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    await user.click(await screen.findByRole('button', { name: 'Reject document' }));

    expect(await screen.findByText('A reason is required to reject a document.')).toBeInTheDocument();
    expect(MOCK_APIS.branchKycApi.review).not.toHaveBeenCalled();
  });

  it('rejects a document with the supplied reason', async () => {
    MOCK_APIS.branchKycApi.review.mockResolvedValue({
      ...KYC_AWAITING,
      documents: [
        { type: 'AADHAAR', status: 'REJECTED', verificationNote: 'blurry', verifiedAt: null, canReupload: true },
        { type: 'DRIVING_LICENSE', status: 'UPLOADED', verificationNote: null, verifiedAt: null, canReupload: true },
      ],
    });
    const user = userEvent.setup();
    render(<ManagerKycCard partnerId="dp-1" />);

    await screen.findByText('KYC review');
    await user.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    await user.type(
      await screen.findByPlaceholderText('Reason (required)'),
      'blurry',
    );
    await user.click(await screen.findByRole('button', { name: 'Reject document' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchKycApi.review).toHaveBeenCalledWith(
        'dp-1',
        'AADHAAR',
        { action: 'REJECT', note: 'blurry' },
        'test-token',
      ),
    );
    expect(await screen.findByText('Note: blurry')).toBeInTheDocument();
  });
});
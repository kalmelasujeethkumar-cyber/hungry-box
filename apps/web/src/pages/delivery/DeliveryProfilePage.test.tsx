import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryPartnerProfileDto } from '@hungrybox/shared';
import DeliveryProfilePage from './DeliveryProfilePage';

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
  deliveryPartnerApi: { profile: vi.fn(), kycStatus: vi.fn(), kycDocumentAccess: vi.fn() },
}));

vi.mock('../../api/client', () => MOCK_APIS);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));

const PROFILE: DeliveryPartnerProfileDto = {
  id: 'dp-1',
  partnerId: 'HB-DP-000001',
  userId: 'dp-user-1',
  branch: { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' },
  fullName: 'Shiva Kumar',
  mobile: '9000000000',
  email: null,
  dateOfBirth: '1998-04-12T00:00:00.000Z',
  gender: 'Male',
  emergencyContactName: 'Ravi',
  emergencyContactPhone: '9888888888',
  profilePhotoUrl: null,
  houseFlat: null,
  streetArea: null,
  city: null,
  state: null,
  postalCode: null,
  latitude: null,
  longitude: null,
  identityVerified: true,
  addressProofVerified: true,
  drivingLicenceNumber: 'XXXX XXXX 2025',
  licenceType: 'MCWG',
  licenceExpiry: '2029-12-31',
  licenceVerified: true,
  vehicleType: 'Two-wheeler',
  vehicleNumber: 'AP07AB4321',
  vehicleBrand: null,
  vehicleModel: null,
  vehicleColour: 'Blue',
  registrationYear: null,
  rcReference: null,
  insuranceReference: null,
  insuranceExpiry: null,
  ownVehicle: true,
  accountHolderName: null,
  bankName: null,
  accountNumberMasked: 'XXXX XXXX 4321',
  ifsc: 'SBIN0000001',
  payoutVerified: true,
  partnerType: 'GIG',
  joinedAt: '2026-09-01T00:00:00.000Z',
  status: 'ACTIVE',
  availability: 'ONLINE',
  wentOnlineAt: '2026-09-23T08:00:00.000Z',
  activeDeliveryCount: 0,
  documents: [
    { id: 'doc-aadhaar', type: 'AADHAAR', documentReference: 'XXXX XXXX 1234', status: 'VERIFIED', verificationNote: null, verifiedAt: '2026-09-02T00:00:00.000Z' },
    { id: 'doc-pan', type: 'PAN', documentReference: 'XXXXX1234X', status: 'VERIFIED', verificationNote: null, verifiedAt: '2026-09-02T00:00:00.000Z' },
  ],
};

const KYC_STATUS = {
  partnerId: 'HB-DP-000001',
  fullName: 'Shiva Kumar',
  branchId: 'br-guntur',
  branchName: 'Guntur',
  overallState: 'VERIFIED' as const,
  documents: [
    { type: 'AADHAAR' as const, status: 'VERIFIED' as const, verificationNote: null, verifiedAt: '2026-09-02T00:00:00.000Z', canReupload: false },
    { type: 'DRIVING_LICENSE' as const, status: 'VERIFIED' as const, verificationNote: null, verifiedAt: '2026-09-02T00:00:00.000Z', canReupload: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.deliveryPartnerApi.profile.mockResolvedValue(PROFILE);
  MOCK_APIS.deliveryPartnerApi.kycStatus.mockResolvedValue(KYC_STATUS);
});

describe('delivery profile', () => {
  it('renders masked identity, vehicle and document details', async () => {
    render(
      <MemoryRouter>
        <DeliveryProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Shiva Kumar/)).toBeInTheDocument();
    expect(screen.getByText(/HB-DP-000001/)).toBeInTheDocument();
    expect(screen.getByText('XXXX XXXX 2025')).toBeInTheDocument();
    expect(screen.getByText('XXXX XXXX 4321')).toBeInTheDocument();
    expect(screen.getByText('AP07AB4321')).toBeInTheDocument();
    await screen.findByText('KYC complete');
    expect(screen.getAllByText('Aadhaar').length).toBe(2);
    expect(screen.getByText(/2\/2 verified/)).toBeInTheDocument();
    expect(MOCK_APIS.deliveryPartnerApi.profile).toHaveBeenCalledWith('test-token');
    expect(MOCK_APIS.deliveryPartnerApi.kycStatus).toHaveBeenCalledWith('test-token');
  });

  it('warns a non-active partner that their profile is pending verification', async () => {
    MOCK_APIS.deliveryPartnerApi.profile.mockResolvedValue({
      ...PROFILE,
      status: 'DOCUMENT_REVIEW',
      documents: [],
    });
    render(
      <MemoryRouter>
        <DeliveryProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Your branch manager reviews your documents/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/0 verified/)).toBeInTheDocument();
  });

  it('shows only masked references for sensitive documents', async () => {
    render(
      <MemoryRouter>
        <DeliveryProfilePage />
      </MemoryRouter>,
    );

    await screen.findByText(/Shiva Kumar/);
    expect(screen.getByText('XXXX XXXX 1234')).toBeInTheDocument();
  });
});
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryAssignmentDto, DeliveryPartnerProfileDto } from '@hungrybox/shared';
import DeliveryHomePage from '../../pages/delivery/DeliveryHomePage';

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
    profile: vi.fn(),
    setAvailability: vi.fn(),
    updateLocation: vi.fn(),
    myAssignments: vi.fn(),
    getAssignment: vi.fn(),
    accept: vi.fn(),
    reject: vi.fn(),
    pickup: vi.fn(),
    outForDelivery: vi.fn(),
    deliver: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly details: Record<string, unknown> | null;
    constructor(message: string, status: number, details: Record<string, unknown> | null = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  },
}));

vi.mock('../../api/client', () => MOCK_APIS);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));
vi.mock('./use-delivery-realtime', () => ({
  useDeliveryRealtime: () => ({ lastEvent: null, connected: false, refetchKey: 0 }),
  RealtimeIndicator: () => <span>Syncing</span>,
}));

const BRANCH = { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' };

const PROFILE: DeliveryPartnerProfileDto = {
  id: 'dp-1',
  partnerId: 'HB-DP-000001',
  userId: 'dp-user-1',
  branch: BRANCH,
  fullName: 'Shiva Kumar',
  mobile: '9000000000',
  email: null,
  dateOfBirth: null,
  gender: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
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
  vehicleColour: null,
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
  documents: [],
};

const ACTIVE_ITEM = {
  id: 'assign-1',
  status: 'ASSIGNED' as const,
  orderNumber: 'HB-20260923-000007',
  branchCity: 'Guntur',
  recipientName: 'Demo Customer',
  addressCity: 'Guntur',
  totalMinor: 40000,
  assignedAt: '2026-09-23T10:30:00.000Z',
  acceptedAt: null,
  deliveredAt: null,
};

const FULL_ASSIGNMENT: DeliveryAssignmentDto = {
  id: 'assign-1',
  status: 'ASSIGNED',
  order: {
    id: 'ord-9',
    orderNumber: 'HB-20260923-000007',
    status: 'READY_FOR_PICKUP',
    totalMinor: 40000,
    notes: null,
    branch: BRANCH,
    address: {
      houseFlat: '4-72',
      streetArea: 'Arundelpet Road',
      landmark: null,
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522002',
    },
  },
  deliveryPartner: {
    id: 'dp-1',
    partnerId: 'HB-DP-000001',
    fullName: 'Shiva Kumar',
    profilePhotoUrl: null,
    mobile: '9000000000',
    vehicleType: 'Two-wheeler',
    vehicleNumber: 'AP07AB4321',
  },
  assignedAt: '2026-09-23T10:30:00.000Z',
  acceptedAt: null,
  rejectedAt: null,
  pickedUpAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  cancelledAt: null,
  rejectionReason: null,
  notes: null,
};

function renderDashboard(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <DeliveryHomePage />
    </MemoryRouter>,
  );
}

const withStatus = (status: DeliveryAssignmentDto['status']): DeliveryAssignmentDto => ({
  ...FULL_ASSIGNMENT,
  status,
  acceptedAt: status === 'ASSIGNED' ? null : '2026-09-23T10:31:00.000Z',
  pickedUpAt: status === 'ACCEPTED' ? null : '2026-09-23T10:35:00.000Z',
  outForDeliveryAt:
    status === 'PICKED_UP' || status === 'OUT_FOR_DELIVERY' ? '2026-09-23T10:40:00.000Z' : null,
  deliveredAt: status === 'DELIVERED' ? '2026-09-23T11:00:00.000Z' : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.deliveryPartnerApi.profile.mockResolvedValue(PROFILE);
  MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([]);
  MOCK_APIS.deliveryPartnerApi.getAssignment.mockResolvedValue(FULL_ASSIGNMENT);
  MOCK_APIS.deliveryPartnerApi.accept.mockResolvedValue(withStatus('ACCEPTED'));
  MOCK_APIS.deliveryPartnerApi.reject.mockResolvedValue({ ...FULL_ASSIGNMENT, status: 'REJECTED' });
  MOCK_APIS.deliveryPartnerApi.pickup.mockResolvedValue(withStatus('PICKED_UP'));
  MOCK_APIS.deliveryPartnerApi.outForDelivery.mockResolvedValue(withStatus('OUT_FOR_DELIVERY'));
  MOCK_APIS.deliveryPartnerApi.deliver.mockResolvedValue(withStatus('DELIVERED'));
});

describe('delivery dashboard', () => {
  it('greets the partner and shows availability with a toggle', async () => {
    MOCK_APIS.deliveryPartnerApi.setAvailability.mockResolvedValue({ ...PROFILE, availability: 'OFFLINE' });
    renderDashboard();

    expect(await screen.findByText(/Hi Shiva Kumar/)).toBeInTheDocument();
    expect(screen.getByText(/HB-DP-000001/)).toBeInTheDocument();
    expect(screen.getByText(/Online/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go offline' })).toHaveAttribute('aria-pressed', 'true');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Go offline' }));

    await waitFor(() =>
      expect(MOCK_APIS.deliveryPartnerApi.setAvailability).toHaveBeenCalledWith('OFFLINE', 'test-token'),
    );
    expect(await screen.findByRole('button', { name: 'Go online' })).toBeInTheDocument();
  });

  it('shows an offline empty state telling the partner to go online', async () => {
    MOCK_APIS.deliveryPartnerApi.profile.mockResolvedValue({ ...PROFILE, availability: 'OFFLINE', wentOnlineAt: null });
    renderDashboard();

    expect(await screen.findByText('You are offline')).toBeInTheDocument();
    expect(screen.getByText('Go online to receive delivery requests in your branch area.')).toBeInTheDocument();
  });

  it('accepts a new assignment and refreshes', async () => {
    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([ACTIVE_ITEM]);
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText('HB-20260923-000007')).toBeInTheDocument();
    expect(screen.getByText('Do you want this delivery?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept delivery' }));
    await waitFor(() =>
      expect(MOCK_APIS.deliveryPartnerApi.accept).toHaveBeenCalledWith('assign-1', 'test-token'),
    );
  });

  it('rejects an assignment only after a reason is entered', async () => {
    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([ACTIVE_ITEM]);
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('Do you want this delivery?');
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('dialog', { name: 'Reject this delivery?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject delivery' }));

    expect(await screen.findByText('Please add a short reason before rejecting.')).toBeInTheDocument();
    expect(MOCK_APIS.deliveryPartnerApi.reject).not.toHaveBeenCalled();

    await user.type(within(dialog).getByPlaceholderText(/Reason/), 'distance too far');
    await user.click(within(dialog).getByRole('button', { name: 'Reject delivery' }));

    await waitFor(() =>
      expect(MOCK_APIS.deliveryPartnerApi.reject).toHaveBeenCalledWith('assign-1', 'distance too far', 'test-token'),
    );
  });

  it('walks an accepted delivery through pickup, out-for-delivery and deliver', async () => {
    const user = userEvent.setup();
    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([{ ...ACTIVE_ITEM, status: 'ACCEPTED' }]);
    MOCK_APIS.deliveryPartnerApi.getAssignment.mockResolvedValue(withStatus('ACCEPTED'));
    renderDashboard();

    await screen.findByText('HB-20260923-000007');
    expect(screen.getByRole('button', { name: 'Mark picked up' })).toBeInTheDocument();

    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([{ ...ACTIVE_ITEM, status: 'PICKED_UP' }]);
    MOCK_APIS.deliveryPartnerApi.getAssignment.mockResolvedValue(withStatus('PICKED_UP'));
    await user.click(screen.getByRole('button', { name: 'Mark picked up' }));
    await waitFor(() =>
      expect(MOCK_APIS.deliveryPartnerApi.pickup).toHaveBeenCalledWith('assign-1', 'test-token'),
    );
    expect(await screen.findByRole('button', { name: 'Start delivery' })).toBeInTheDocument();

    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([
      { ...ACTIVE_ITEM, status: 'OUT_FOR_DELIVERY' },
    ]);
    MOCK_APIS.deliveryPartnerApi.getAssignment.mockResolvedValue(withStatus('OUT_FOR_DELIVERY'));
    await user.click(screen.getByRole('button', { name: 'Start delivery' }));
    await waitFor(() =>
      expect(MOCK_APIS.deliveryPartnerApi.outForDelivery).toHaveBeenCalledWith('assign-1', 'test-token'),
    );

    expect(await screen.findByRole('button', { name: 'Mark as delivered' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as delivered' }));
    await waitFor(() =>
      expect(MOCK_APIS.deliveryPartnerApi.deliver).toHaveBeenCalledWith('assign-1', 'test-token'),
    );
  });

  it('offers linked navigation while the delivery is active', async () => {
    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([
      { ...ACTIVE_ITEM, status: 'PICKED_UP' },
    ]);
    MOCK_APIS.deliveryPartnerApi.getAssignment.mockResolvedValue(withStatus('PICKED_UP'));
    renderDashboard();

    const navigation = await screen.findByRole('link', { name: 'Navigate' });
    expect(navigation).toHaveAttribute('href', expect.stringMatching(/google\.com\/maps/));
  });
});
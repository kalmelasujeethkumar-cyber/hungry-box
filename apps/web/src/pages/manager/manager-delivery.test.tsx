import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeliveryAssignmentListItemDto,
  DeliveryPartnerCandidateDto,
  DeliveryPartnerListItemDto,
  DeliveryPartnerProfileDto,
} from '@hungrybox/shared';
import ManagerAssignmentsPage from '../../pages/manager/ManagerAssignmentsPage';
import ManagerPartnerDetailPage from '../../pages/manager/ManagerPartnerDetailPage';
import ManagerPartnersPage from '../../pages/manager/ManagerPartnersPage';

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
  branchOrdersApi: { list: vi.fn() },
  branchDeliveryApi: {
    listPartners: vi.fn(),
    getPartner: vi.fn(),
    createPartner: vi.fn(),
    updatePartner: vi.fn(),
    setPartnerStatus: vi.fn(),
    verifyPartner: vi.fn(),
    upsertPartnerDocument: vi.fn(),
    reviewPartnerDocument: vi.fn(),
    candidates: vi.fn(),
    listAssignments: vi.fn(),
    assign: vi.fn(),
    cancelAssignment: vi.fn(),
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

const BRANCH = { id: 'br-guntur', name: 'Guntur', code: 'GNT', city: 'Guntur' };

const PARTNER_LIST: DeliveryPartnerListItemDto[] = [
  {
    id: 'dp-1',
    partnerId: 'HB-DP-000001',
    fullName: 'Shiva Kumar',
    mobile: '9000000000',
    branch: BRANCH,
    status: 'ACTIVE',
    availability: 'ONLINE',
    activeDeliveryCount: 0,
    distanceKm: 2.1,
    joinedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'dp-2',
    partnerId: 'HB-DP-000002',
    fullName: 'Ravi Teja',
    mobile: '9111111111',
    branch: BRANCH,
    status: 'PENDING_VERIFICATION',
    availability: 'OFFLINE',
    activeDeliveryCount: 0,
    distanceKm: null,
    joinedAt: null,
  },
];

const PARTNER_DETAIL: DeliveryPartnerProfileDto = {
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
  status: 'DOCUMENT_REVIEW',
  availability: 'OFFLINE',
  wentOnlineAt: null,
  activeDeliveryCount: 0,
  documents: [
    { id: 'doc-a', type: 'AADHAAR', documentReference: 'XXXX XXXX 1234', status: 'UPLOADED', verificationNote: null, verifiedAt: null },
    { id: 'doc-ap', type: 'ADDRESS_PROOF', documentReference: 'XXXX XXXX 5678', status: 'UPLOADED', verificationNote: null, verifiedAt: null },
    { id: 'doc-p', type: 'PAN', documentReference: 'XXXXX1234X', status: 'UPLOADED', verificationNote: null, verifiedAt: null },
    { id: 'doc-l', type: 'DRIVING_LICENSE', documentReference: 'XXXX XXXX 2025', status: 'UPLOADED', verificationNote: null, verifiedAt: null },
  ],
};

const ASSIGNMENT_LIST: DeliveryAssignmentListItemDto[] = [
  {
    id: 'assign-1',
    status: 'ACCEPTED',
    orderNumber: 'HB-20260923-000007',
    branchCity: 'Guntur',
    recipientName: 'Demo Customer',
    addressCity: 'Guntur',
    totalMinor: 40000,
    assignedAt: '2026-09-23T10:30:00.000Z',
    acceptedAt: '2026-09-23T10:31:00.000Z',
    deliveredAt: null,
  },
];

const CANDIDATES: DeliveryPartnerCandidateDto[] = [
  {
    id: 'dp-1',
    partnerId: 'HB-DP-000001',
    fullName: 'Shiva Kumar',
    status: 'ACTIVE',
    availability: 'ONLINE',
    online: true,
    activeDeliveryCount: 0,
    distanceKm: 2.1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.branchDeliveryApi.listPartners.mockResolvedValue(PARTNER_LIST);
  MOCK_APIS.branchDeliveryApi.getPartner.mockResolvedValue(PARTNER_DETAIL);
  MOCK_APIS.branchDeliveryApi.listAssignments.mockResolvedValue(ASSIGNMENT_LIST);
  MOCK_APIS.branchDeliveryApi.candidates.mockResolvedValue(CANDIDATES);
  MOCK_APIS.branchOrdersApi.list.mockResolvedValue([
    {
      id: 'ord-9',
      orderNumber: 'HB-20260923-000007',
      status: 'READY_FOR_PICKUP',
      paymentStatus: 'PAID',
      branch: BRANCH,
      itemCount: 2,
      subtotalMinor: 40000,
      discountMinor: 0,
      deliveryFeeMinor: 3000,
      taxMinor: 0,
      totalMinor: 43000,
      placedAt: '2026-09-23T10:00:00.000Z',
      cancelledAt: null,
    },
  ]);
});

describe('manager partner list', () => {
  it('renders partners with status and availability', async () => {
    render(
      <MemoryRouter>
        <ManagerPartnersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Shiva Kumar')).toBeInTheDocument();
    expect(screen.getByText(/HB-DP-000001/)).toBeInTheDocument();
    expect(screen.getByText(/2.1 km/)).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Ravi Teja')).toBeInTheDocument();
  });

  it('creates a partner and shows the one-time password', async () => {
    MOCK_APIS.branchDeliveryApi.createPartner.mockResolvedValue({
      profile: PARTNER_DETAIL,
      temporaryPassword: 'aA1bB2c',
    });
    MOCK_APIS.branchDeliveryApi.listPartners.mockResolvedValue([PARTNER_LIST[0]]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerPartnersPage />
      </MemoryRouter>,
    );

    await screen.findByText('Shiva Kumar');
    await user.click(screen.getByRole('button', { name: 'Add partner' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add delivery partner' });
    await user.type(within(dialog).getByLabelText('Full name'), 'Sai Kumar');
    await user.type(within(dialog).getByLabelText('Login ID (email or phone)'), 'sai@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create partner' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchDeliveryApi.createPartner).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Sai Kumar', loginId: 'sai@example.com' }),
        'test-token',
      ),
    );
    expect(await screen.findByText('aA1bB2c')).toBeInTheDocument();
    expect(screen.getByText(/Share it once/)).toBeInTheDocument();
  });

  it('surfaces a duplicate-login error within the dialog', async () => {
    MOCK_APIS.branchDeliveryApi.createPartner.mockRejectedValue(
      new Error('That login ID is already in use.'),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerPartnersPage />
      </MemoryRouter>,
    );

    await screen.findByText('Shiva Kumar');
    await user.click(screen.getByRole('button', { name: 'Add partner' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add delivery partner' });
    await user.type(within(dialog).getByLabelText('Full name'), 'Sai Kumar');
    await user.type(within(dialog).getByLabelText('Login ID (email or phone)'), 'shiva@');
    await user.click(within(dialog).getByRole('button', { name: 'Create partner' }));

    expect(await screen.findByText('That login ID is already in use.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('manager partner detail', () => {
  it('reviews documents by approving an uploaded one', async () => {
    MOCK_APIS.branchDeliveryApi.reviewPartnerDocument.mockResolvedValue({
      ...PARTNER_DETAIL,
      documents: [
        { ...PARTNER_DETAIL.documents[0], status: 'VERIFIED' as const },
        PARTNER_DETAIL.documents[1],
      ],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/manager/partners/dp-1']}>
        <Routes>
          <Route path="/manager/partners/:partnerId" element={<ManagerPartnerDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Shiva Kumar');
    const aadhaarRow = screen.getByText('Aadhaar').closest('li');
    expect(aadhaarRow).not.toBeNull();
    await user.click(within(aadhaarRow!).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchDeliveryApi.reviewPartnerDocument).toHaveBeenCalledWith(
        'dp-1',
        'doc-a',
        { action: 'APPROVE', note: undefined },
        'test-token',
      ),
    );
    expect(await screen.findByText('Awaiting 3 more required documents.')).toBeInTheDocument();
  });

  it('rejects a document with a note', async () => {
    MOCK_APIS.branchDeliveryApi.reviewPartnerDocument.mockResolvedValue({
      ...PARTNER_DETAIL,
      documents: [
        { ...PARTNER_DETAIL.documents[0], status: 'REJECTED' as const, verificationNote: 'blurry' },
        PARTNER_DETAIL.documents[1],
      ],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/manager/partners/dp-1']}>
        <Routes>
          <Route path="/manager/partners/:partnerId" element={<ManagerPartnerDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Shiva Kumar');
    const aadhaarRow = screen.getByText('Aadhaar').closest('li');
    await user.click(within(aadhaarRow!).getByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('dialog', { name: 'Reject this document?' });
    await user.type(within(dialog).getByPlaceholderText('Reason (optional)'), 'blurry');
    await user.click(within(dialog).getByRole('button', { name: 'Reject document' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchDeliveryApi.reviewPartnerDocument).toHaveBeenCalledWith(
        'dp-1',
        'doc-a',
        { action: 'REJECT', note: 'blurry' },
        'test-token',
      ),
    );
  });

  it('approves a reviewed profile via the verify action', async () => {
    MOCK_APIS.branchDeliveryApi.verifyPartner.mockResolvedValue({
      ...PARTNER_DETAIL,
      status: 'VERIFIED',
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/manager/partners/dp-1']}>
        <Routes>
          <Route path="/manager/partners/:partnerId" element={<ManagerPartnerDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Shiva Kumar');
    await user.click(screen.getByRole('button', { name: 'Approve & verify' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchDeliveryApi.verifyPartner).toHaveBeenCalledWith(
        'dp-1',
        { action: 'APPROVE' },
        'test-token',
      ),
    );
    expect(await screen.findByRole('button', { name: 'Activate' })).toBeInTheDocument();
  });

  it('deactivates and suspends an active partner', async () => {
    MOCK_APIS.branchDeliveryApi.getPartner.mockResolvedValue({
      ...PARTNER_DETAIL,
      status: 'ACTIVE',
      availability: 'ONLINE',
    });
    MOCK_APIS.branchDeliveryApi.setPartnerStatus.mockResolvedValue({
      ...PARTNER_DETAIL,
      status: 'INACTIVE',
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/manager/partners/dp-1']}>
        <Routes>
          <Route path="/manager/partners/:partnerId" element={<ManagerPartnerDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Shiva Kumar');
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(MOCK_APIS.branchDeliveryApi.setPartnerStatus).toHaveBeenCalledWith(
        'dp-1',
        { status: 'INACTIVE' },
        'test-token',
      ),
    );
  });
});

describe('manager assignments', () => {
  it('lists branch assignments', async () => {
    render(
      <MemoryRouter>
        <ManagerAssignmentsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('HB-20260923-000007')).toBeInTheDocument();
    expect(screen.getAllByText('Accepted').length).toBeGreaterThanOrEqual(1);
  });

  it('assigns a ready order to an online partner', async () => {
    MOCK_APIS.branchDeliveryApi.assign.mockResolvedValue({
      id: 'assign-1',
      status: 'ASSIGNED',
      order: {
        id: 'ord-9',
        orderNumber: 'HB-20260923-000007',
        status: 'READY_FOR_PICKUP',
        totalMinor: 43000,
        notes: null,
        branch: BRANCH,
        address: null,
      },
      deliveryPartner: null,
      assignedAt: '2026-09-23T10:30:00.000Z',
      acceptedAt: null,
      rejectedAt: null,
      pickedUpAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      cancelledAt: null,
      rejectionReason: null,
      notes: null,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagerAssignmentsPage />
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260923-000007');
    await user.click(screen.getByRole('button', { name: 'Assign ready order' }));

    const dialog = await screen.findByRole('dialog', { name: 'Assign a ready order' });
    expect(within(dialog).getByLabelText('Order')).toHaveValue('ord-9');
    await user.selectOptions(within(dialog).getByLabelText('Partner'), 'dp-1');
    await user.click(within(dialog).getByRole('button', { name: 'Assign delivery' }));

    await waitFor(() =>
      expect(MOCK_APIS.branchDeliveryApi.assign).toHaveBeenCalledWith(
        'ord-9',
        { deliveryPartnerId: 'dp-1' },
        'test-token',
      ),
    );
    expect(
      await screen.findByText('Delivery assigned. The partner has been notified.'),
    ).toBeInTheDocument();
  });

  it('shows a friendly empty state without candidates', async () => {
    MOCK_APIS.branchDeliveryApi.listAssignments.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <ManagerAssignmentsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No assignments here')).toBeInTheDocument();
    expect(screen.getByText(/assign a ready order/i)).toBeInTheDocument();
  });
});
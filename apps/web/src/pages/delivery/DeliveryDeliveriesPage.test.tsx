import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryAssignmentListItemDto } from '@hungrybox/shared';
import DeliveryDeliveriesPage from '../../pages/delivery/DeliveryDeliveriesPage';

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
}));

vi.mock('../../api/client', () => MOCK_APIS);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => MOCK_AUTH,
}));

const DELIVERED: DeliveryAssignmentListItemDto = {
  id: 'assign-2',
  status: 'DELIVERED',
  orderNumber: 'HB-20260922-000003',
  branchCity: 'Guntur',
  recipientName: 'Demo Customer',
  addressCity: 'Guntur',
  totalMinor: 11000,
  assignedAt: '2026-09-22T09:00:00.000Z',
  acceptedAt: '2026-09-22T09:05:00.000Z',
  deliveredAt: '2026-09-22T09:40:00.000Z',
};

const CANCELLED: DeliveryAssignmentListItemDto = {
  ...DELIVERED,
  id: 'assign-3',
  orderNumber: 'HB-20260921-000002',
  status: 'CANCELLED',
  deliveredAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([DELIVERED, CANCELLED]);
});

describe('delivery history', () => {
  it('lists past deliveries with status and totals', async () => {
    render(
      <MemoryRouter>
        <DeliveryDeliveriesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('HB-20260922-000003')).toBeInTheDocument();
    expect(screen.getByText('HB-20260921-000002')).toBeInTheDocument();
    expect(screen.getAllByText('Delivered').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('₹110').length).toBeGreaterThanOrEqual(1);
  });

  it('filters by status tab and passes the filter to the API', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeliveryDeliveriesPage />
      </MemoryRouter>,
    );

    await screen.findByText('HB-20260922-000003');
    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([DELIVERED]);
    await user.click(screen.getByRole('tab', { name: 'Delivered' }));

    expect(await screen.findByText('HB-20260922-000003')).toBeInTheDocument();
    expect(screen.queryByText('HB-20260921-000002')).not.toBeInTheDocument();
    expect(
      MOCK_APIS.deliveryPartnerApi.myAssignments,
    ).toHaveBeenLastCalledWith('test-token', 'DELIVERED');
  });

  it('shows an empty state when there is no history for a filter', async () => {
    MOCK_APIS.deliveryPartnerApi.myAssignments.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <DeliveryDeliveriesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No deliveries here')).toBeInTheDocument();
  });

  it('relays a server failure to the list instead of crashing', async () => {
    MOCK_APIS.deliveryPartnerApi.myAssignments.mockRejectedValue(new Error('Unable to reach the server'));
    render(
      <MemoryRouter>
        <DeliveryDeliveriesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Unable to reach the server')).toBeInTheDocument();
  });
});
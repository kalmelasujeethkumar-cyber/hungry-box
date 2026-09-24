import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryTrackingDto } from '@hungrybox/shared';
import DeliveryTrackingSection from './DeliveryTrackingSection';

const MOCK_APIS = vi.hoisted(() => ({
  deliveryTrackingApi: { get: vi.fn() },
}));

vi.mock('../../api/client', () => MOCK_APIS);

const TRACKING_LIVE: DeliveryTrackingDto = {
  orderId: 'ord-9',
  orderNumber: 'HB-20260923-000007',
  orderStatus: 'OUT_FOR_DELIVERY',
  assignment: {
    id: 'assign-1',
    status: 'OUT_FOR_DELIVERY',
    assignedAt: '2026-09-23T10:30:00.000Z',
    acceptedAt: '2026-09-23T10:31:00.000Z',
    pickedUpAt: '2026-09-23T10:35:00.000Z',
    outForDeliveryAt: '2026-09-23T10:40:00.000Z',
    deliveredAt: null,
  },
  partner: {
    fullName: 'Shiva Kumar',
    profilePhotoUrl: null,
    vehicleType: 'Two-wheeler',
    vehicleNumber: 'AP07AB4321',
    mobile: '9000000000',
  },
  location: { latitude: 16.305, longitude: 80.445, accuracy: 12, recordedAt: '2026-09-23T10:41:00.000Z' },
  distanceToDestinationKm: 2.4,
  trackingAvailable: true,
};

const TRACKING_NO_LOCATION: DeliveryTrackingDto = {
  ...TRACKING_LIVE,
  location: null,
  distanceToDestinationKm: null,
};

const TRACKING_WAITING: DeliveryTrackingDto = {
  orderId: 'ord-9',
  orderNumber: 'HB-20260923-000007',
  orderStatus: 'PREPARING',
  assignment: null,
  partner: null,
  location: null,
  distanceToDestinationKm: null,
  trackingAvailable: false,
};

const TRACKING_DELIVERED: DeliveryTrackingDto = {
  ...TRACKING_LIVE,
  orderStatus: 'DELIVERED',
  assignment: {
    id: 'assign-1',
    status: 'DELIVERED',
    assignedAt: '2026-09-23T10:30:00.000Z',
    acceptedAt: '2026-09-23T10:31:00.000Z',
    pickedUpAt: '2026-09-23T10:35:00.000Z',
    outForDeliveryAt: '2026-09-23T10:40:00.000Z',
    deliveredAt: '2026-09-23T11:00:00.000Z',
  },
  location: null,
  distanceToDestinationKm: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('customer delivery tracking', () => {
  it('shows a waiting state before a partner is assigned', async () => {
    MOCK_APIS.deliveryTrackingApi.get.mockResolvedValue(TRACKING_WAITING);
    render(<DeliveryTrackingSection orderId="ord-9" orderStatus="PREPARING" token="t" />);

    expect(await screen.findByText('Waiting for a partner')).toBeInTheDocument();
    expect(
      screen.getByText(/will be assigned once your order is ready/),
    ).toBeInTheDocument();
  });

  it('shows the partner, vehicle and live distance while out for delivery', async () => {
    MOCK_APIS.deliveryTrackingApi.get.mockResolvedValue(TRACKING_LIVE);
    render(<DeliveryTrackingSection orderId="ord-9" orderStatus="OUT_FOR_DELIVERY" token="t" />);

    expect(await screen.findByText('Shiva Kumar')).toBeInTheDocument();
    expect(screen.getByText(/Two-wheeler AP07AB4321/)).toBeInTheDocument();
    expect(screen.getByText(/About 2.4 km away/)).toBeInTheDocument();
    expect(screen.getByTestId('live-location')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in maps' })).toHaveAttribute(
      'href',
      expect.stringMatching(/16\.305/),
    );
    expect(screen.getByRole('link', { name: 'Call partner' })).toHaveAttribute('href', 'tel:9000000000');
    expect(MOCK_APIS.deliveryTrackingApi.get).toHaveBeenCalledWith('ord-9', 't');
  });

  it('gracefully reports when the live location is unavailable mid-delivery', async () => {
    MOCK_APIS.deliveryTrackingApi.get.mockResolvedValue(TRACKING_NO_LOCATION);
    render(<DeliveryTrackingSection orderId="ord-9" orderStatus="OUT_FOR_DELIVERY" token="t" />);

    expect(await screen.findByText('Approximate location not available')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in maps' })).not.toBeInTheDocument();
  });

  it('confirms a completed delivery with the partner name', async () => {
    MOCK_APIS.deliveryTrackingApi.get.mockResolvedValue(TRACKING_DELIVERED);
    render(<DeliveryTrackingSection orderId="ord-9" orderStatus="DELIVERED" token="t" />);

    expect(await screen.findByText(/Delivered by Shiva Kumar/)).toBeInTheDocument();
  });

  it('surfaces a network failure without crashing the order page', async () => {
    MOCK_APIS.deliveryTrackingApi.get.mockRejectedValue(new Error('Unable to reach the server'));
    render(<DeliveryTrackingSection orderId="ord-9" orderStatus="OUT_FOR_DELIVERY" token="t" />);

    expect(await screen.findByText('Unable to reach the server')).toBeInTheDocument();
  });
});
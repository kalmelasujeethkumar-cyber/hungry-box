import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OrderDetailDto } from '@hungrybox/shared';
import OrderTimeline from './OrderTimeline';

const BASE_EVENTS: OrderDetailDto['events'] = [
  {
    id: 'e-1',
    kind: 'ORDER_CREATED',
    fromStatus: null,
    toStatus: 'PLACED',
    actorRole: 'SYSTEM',
    at: '2026-09-23T10:00:00.000Z',
  },
  {
    id: 'e-2',
    kind: 'ORDER_STATUS_CHANGED',
    fromStatus: 'PLACED',
    toStatus: 'CONFIRMED',
    actorRole: 'BRANCH_MANAGER',
    at: '2026-09-23T10:05:00.000Z',
  },
  {
    id: 'e-3',
    kind: 'ORDER_STATUS_CHANGED',
    fromStatus: 'CONFIRMED',
    toStatus: 'PREPARING',
    actorRole: 'BRANCH_MANAGER',
    at: '2026-09-23T10:07:00.000Z',
  },
  {
    id: 'e-4',
    kind: 'ORDER_STATUS_CHANGED',
    fromStatus: 'PREPARING',
    toStatus: 'READY_FOR_PICKUP',
    actorRole: 'BRANCH_MANAGER',
    at: '2026-09-23T10:15:00.000Z',
  },
];

describe('OrderTimeline', () => {
  it('marks the current step and trailing steps as pending', () => {
    render(<OrderTimeline status="READY_FOR_PICKUP" events={BASE_EVENTS} />);

    expect(screen.getByText('Order placed')).toBeInTheDocument();
    expect(screen.getByText('Ready for pickup · current')).toBeInTheDocument();
    expect(screen.getByText('Out for delivery')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByText('Preparing · current')).not.toBeInTheDocument();
    expect(screen.queryByText('Confirmed · current')).not.toBeInTheDocument();
  });

  it('renders a cancelled order with the steps reached before cancellation', () => {
    render(
      <OrderTimeline
        status="CANCELLED"
        events={[
          ...BASE_EVENTS,
          {
            id: 'e-5',
            kind: 'ORDER_CANCELLED',
            fromStatus: 'READY_FOR_PICKUP',
            toStatus: null,
            actorRole: 'CUSTOMER',
            at: '2026-09-23T11:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Out for delivery')).not.toBeInTheDocument();
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument();
  });
});

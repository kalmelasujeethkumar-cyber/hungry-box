import { describe, expect, it, vi } from 'vitest';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeliveryEventsService } from './delivery-events.service';

function buildService() {
  const realtime = {
    emitToUser: vi.fn(),
    emitToBranch: vi.fn(),
  } as unknown as RealtimeGateway;
  const service = new DeliveryEventsService(realtime);
  return { service, realtime };
}

describe('DeliveryEventsService.announce', () => {
  it('emits to every targeted user and to the branch room', () => {
    const { service, realtime } = buildService();

    service.announce(
      'b1',
      'delivery.assignment.created',
      'ASSIGNED',
      'a1',
      'o1',
      'HB-20260925-000001',
      ['u1', 'cust-1'],
    );

    expect(realtime.emitToUser).toHaveBeenCalledTimes(2);
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'u1',
      'delivery.assignment.created',
      expect.objectContaining({
        type: 'delivery.assignment.created',
        assignmentId: 'a1',
        orderId: 'o1',
        orderNumber: 'HB-20260925-000001',
        status: 'ASSIGNED',
        at: expect.any(String),
      }),
    );
    expect(realtime.emitToBranch).toHaveBeenCalledWith(
      'b1',
      'delivery.assignment.created',
      expect.objectContaining({ orderNumber: 'HB-20260925-000001' }),
    );
  });

  it('emits only to the branch when no users are targeted', () => {
    const { service, realtime } = buildService();

    service.announce(
      'b1',
      'delivery.assignment.accepted',
      'ACCEPTED',
      'a1',
      'o1',
      'HB-20260925-000001',
    );

    expect(realtime.emitToUser).not.toHaveBeenCalled();
    expect(realtime.emitToBranch).toHaveBeenCalledTimes(1);
  });
});
import { Injectable } from '@nestjs/common';
import type {
  DeliveryAssignmentStatus,
  DeliveryRealtimeEvent,
  DeliveryRealtimeEventType,
} from '@hungrybox/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class DeliveryEventsService {
  constructor(private readonly realtime: RealtimeGateway) {}

  announce(
    branchId: string,
    type: DeliveryRealtimeEventType,
    status: DeliveryAssignmentStatus,
    assignmentId: string,
    orderId: string,
    orderNumber: string,
    toUserIds: string[] = [],
  ): void {
    const event: DeliveryRealtimeEvent = {
      type,
      assignmentId,
      orderId,
      orderNumber,
      status,
      at: new Date().toISOString(),
    };
    for (const userId of toUserIds) {
      this.realtime.emitToUser(userId, type, event);
    }
    this.realtime.emitToBranch(branchId, type, event);
  }
}
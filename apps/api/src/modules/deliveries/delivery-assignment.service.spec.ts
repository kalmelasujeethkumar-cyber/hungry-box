import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryConflictException } from '../../common/exceptions/delivery-conflict.exception';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { OrderStateService } from '../orders/order-state.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryPartnerService } from '../delivery-partners/delivery-partner.service';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { DeliveryEventsService } from './delivery-events.service';

const BRANCH = { id: 'b1', name: 'Hungry Box Guntur (Demo)', code: 'guntur', city: 'Guntur' };

const ADDRESS = {
  recipientName: 'Demo Customer',
  phone: '9090909090',
  houseFlat: '1-2',
  streetArea: 'Main Road',
  landmark: 'Bus Stop',
  city: 'Guntur',
  state: 'Andhra Pradesh',
  postalCode: '522001',
  latitude: 16.3067,
  longitude: 80.4365,
};

const PARTNER = {
  id: 'p1',
  partnerId: 'HB-DP-000042',
  fullName: 'Shiva Kumar',
  profilePhotoUrl: null,
  mobile: '9000000000',
  vehicleType: 'Bike',
  vehicleNumber: 'AP07 1234',
  userId: 'u1',
};

function assignmentDetail(status = 'ASSIGNED') {
  return {
    id: 'a1',
    branchId: 'b1',
    orderId: 'o1',
    deliveryPartnerId: 'p1',
    status,
    assignedAt: new Date(),
    acceptedAt: status === 'ASSIGNED' ? null : new Date(),
    rejectedAt: null,
    pickedUpAt:
      status === 'PICKED_UP' || status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED'
        ? new Date()
        : null,
    outForDeliveryAt: status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED' ? new Date() : null,
    deliveredAt: status === 'DELIVERED' ? new Date() : null,
    cancelledAt: null,
    rejectionReason: null,
    notes: 'Ring the bell',
    order: {
      id: 'o1',
      orderNumber: 'HB-20260925-000001',
      status: 'READY_FOR_PICKUP',
      totalMinor: 70800,
      notes: null,
      branch: BRANCH,
      address: ADDRESS,
      userId: 'cust-1',
    },
    deliveryPartner: { ...PARTNER, userId: 'u1' },
  };
}

function baseDb() {
  const db = {
    order: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'o1',
        branchId: 'b1',
        status: 'READY_FOR_PICKUP',
        orderNumber: 'HB-20260925-000001',
        userId: 'cust-1',
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    deliveryAssignment: {
      create: vi.fn().mockResolvedValue({ id: 'a1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(assignmentDetail()),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    deliveryPartnerProfile: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'p1', branchId: 'b1', status: 'ACTIVE', availability: 'ONLINE' }),
      findFirst: vi.fn().mockResolvedValue({ id: 'p1', branchId: 'b1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    orderEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: ((): unknown => undefined) as unknown,
  };
  db.$transaction = vi
    .fn()
    .mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
  return db;
}

function buildService<T extends Record<string, unknown> = ReturnType<typeof baseDb>>() {
  const db = baseDb() as unknown as T;
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const orderState = new OrderStateService();
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const partners = {
    hasActiveDelivery: vi.fn().mockResolvedValue(false),
  } as unknown as DeliveryPartnerService;
  const events = { announce: vi.fn() } as unknown as DeliveryEventsService;
  const notifications = {
    notify: vi.fn().mockResolvedValue({}),
  } as unknown as NotificationsService;
  const service = new DeliveryAssignmentService(
    prisma,
    orderState,
    audit,
    partners,
    events,
    notifications,
  );
  return { service, db, audit, partners, events, notifications, prisma };
}

const manager = { role: 'BRANCH_MANAGER' as const, branchId: 'b1', userId: 'u-mgr' };
const superAdmin = { role: 'SUPER_ADMIN' as const, branchId: null, userId: 'u-admin' };

describe('DeliveryAssignmentService.assign', () => {
  it('creates an ASSIGNED assignment and announces it to partner and branch', async () => {
    const { service, db, audit, events, notifications } = buildService();
    db.order.findUnique.mockResolvedValue({
      id: 'o1',
      branchId: 'b1',
      status: 'READY_FOR_PICKUP',
      orderNumber: 'HB-20260925-000001',
      userId: 'cust-1',
    });
    db.deliveryAssignment.findFirst.mockResolvedValue(null);
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      status: 'ACTIVE',
      availability: 'ONLINE',
      userId: 'u1',
    });
    db.deliveryAssignment.findUnique.mockResolvedValue(assignmentDetail('ASSIGNED'));

    const result = await service.assign(superAdmin, 'o1', {
      deliveryPartnerId: 'p1',
      notes: 'Ring the bell',
    });

    expect(db.deliveryAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'o1',
          branchId: 'b1',
          deliveryPartnerId: 'p1',
          status: 'ASSIGNED',
          notes: 'Ring the bell',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DELIVERY_ASSIGNED }),
      db,
    );
    expect(events.announce).toHaveBeenCalledWith(
      'b1',
      'delivery.assignment.created',
      'ASSIGNED',
      'a1',
      'o1',
      'HB-20260925-000001',
      ['u1'],
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'u1',
      'delivery.assignment.created',
      expect.any(String),
      expect.any(String),
    );
    expect(result.id).toBe('a1');
    expect(result.status).toBe('ASSIGNED');
  });

  it('returns 404 when the order does not exist or is out of the manager branch', async () => {
    const { service, db } = buildService();
    db.order.findUnique.mockResolvedValue({
      id: 'o2',
      branchId: 'b-other',
      status: 'READY_FOR_PICKUP',
      orderNumber: 'HB-20260925-000002',
      userId: 'cust-1',
    });

    await expect(service.assign(manager, 'o2', { deliveryPartnerId: 'p1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects assigning an order that is not ready for pickup', async () => {
    const { service, db } = buildService();
    db.order.findUnique.mockResolvedValue({
      id: 'o1',
      branchId: 'b1',
      status: 'PREPARING',
      orderNumber: 'HB-20260925-000001',
      userId: 'cust-1',
    });

    await expect(service.assign(superAdmin, 'o1', { deliveryPartnerId: 'p1' })).rejects.toThrow(
      DeliveryConflictException,
    );
  });

  it('rejects assigning an order that already has an active assignment', async () => {
    const { service, db } = buildService();
    db.order.findUnique.mockResolvedValue({
      id: 'o1',
      branchId: 'b1',
      status: 'READY_FOR_PICKUP',
      orderNumber: 'HB-20260925-000001',
      userId: 'cust-1',
    });
    db.deliveryAssignment.findFirst.mockResolvedValue({ id: 'existing-a' });

    await expect(service.assign(superAdmin, 'o1', { deliveryPartnerId: 'p1' })).rejects.toThrow(
      DeliveryConflictException,
    );
    expect(
      await service.assign(superAdmin, 'o1', { deliveryPartnerId: 'p1' }).catch((e) => e.code),
    ).toBe('delivery.already_assigned');
  });

  it('rejects assigning to an offline partner', async () => {
    const { service, db } = buildService();
    db.order.findUnique.mockResolvedValue({
      id: 'o1',
      branchId: 'b1',
      status: 'READY_FOR_PICKUP',
      orderNumber: 'HB-20260925-000001',
      userId: 'cust-1',
    });
    db.deliveryAssignment.findFirst.mockResolvedValue(null);
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      status: 'ACTIVE',
      availability: 'OFFLINE',
      userId: 'u1',
    });

    await expect(service.assign(superAdmin, 'o1', { deliveryPartnerId: 'p1' })).rejects.toThrow(
      DeliveryConflictException,
    );
  });
});

describe('DeliveryAssignmentService.cancel', () => {
  it('cancels a cancellable assignment', async () => {
    const { service, db, audit, events } = buildService();
    db.order.findUnique.mockResolvedValue({
      id: 'o1',
      branchId: 'b1',
      orderNumber: 'HB-20260925-000001',
      userId: 'cust-1',
    });
    db.deliveryAssignment.updateMany.mockResolvedValue({ count: 1 });
    db.deliveryAssignment.findUnique.mockResolvedValue(assignmentDetail('CANCELLED'));

    const result = await service.cancel(manager, 'o1', 'a1', { reason: 'Not needed' });

    expect(db.deliveryAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'a1', orderId: 'o1' }),
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DELIVERY_CANCELLED }),
      db,
    );
    expect(events.announce).toHaveBeenCalledWith(
      'b1',
      'delivery.assignment.cancelled',
      'CANCELLED',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(result.id).toBe('a1');
  });

  it('rejects cancelling an assignment that is no longer cancellable', async () => {
    const { service, db } = buildService();
    db.order.findUnique.mockResolvedValue({
      id: 'o1',
      branchId: 'b1',
      orderNumber: 'HB-20260925-000001',
      userId: 'cust-1',
    });
    db.deliveryAssignment.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancel(manager, 'o1', 'a1', {})).rejects.toThrow(
      DeliveryConflictException,
    );
  });
});

describe('DeliveryAssignmentService.list', () => {
  it('scopes branch list to manager branch', async () => {
    const { service, db } = buildService();
    db.deliveryAssignment.findMany.mockResolvedValue([
      {
        id: 'a1',
        status: 'ASSIGNED',
        assignedAt: new Date(),
        acceptedAt: null,
        deliveredAt: null,
        order: {
          orderNumber: 'HB-20260925-000001',
          totalMinor: 70800,
          branch: { city: 'Guntur' },
          address: { recipientName: 'Demo Customer', city: 'Guntur' },
        },
      },
    ]);

    const rows = await service.list(manager, {});

    expect(db.deliveryAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b1' }) }),
    );
    expect(rows[0]?.orderNumber).toBe('HB-20260925-000001');
    expect(rows[0]?.branchCity).toBe('Guntur');
  });

  it('filters by status', async () => {
    const { service, db } = buildService();
    db.deliveryAssignment.findMany.mockResolvedValue([]);

    await service.list(superAdmin, { status: 'PICKED_UP' });

    expect(db.deliveryAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PICKED_UP' }) }),
    );
  });

  it('lets a super admin scope the list to a chosen branch', async () => {
    const { service, db } = buildService();
    db.deliveryAssignment.findMany.mockResolvedValue([]);

    await service.list(superAdmin, { branchId: 'b2' });

    expect(db.deliveryAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: 'b2' }) }),
    );
  });
});

describe('DeliveryAssignmentService.accept / reject', () => {
  it('accepts a pending assignment and moves the partner to ON_DELIVERY', async () => {
    const { service, db, audit, events } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.updateMany.mockResolvedValue({ count: 1 });
    db.deliveryPartnerProfile.update.mockResolvedValue({});
    db.deliveryAssignment.findUnique.mockResolvedValue(assignmentDetail('ACCEPTED'));

    const result = await service.accept('u1', 'a1');

    expect(db.deliveryAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ASSIGNED' }) }),
    );
    expect(db.deliveryPartnerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ availability: 'ON_DELIVERY' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DELIVERY_ACCEPTED }),
      db,
    );
    expect(events.announce).toHaveBeenCalledWith(
      'b1',
      'delivery.assignment.accepted',
      'ACCEPTED',
      'a1',
      'o1',
      'HB-20260925-000001',
      [],
    );
    expect(result.status).toBe('ACCEPTED');
  });

  it('rejects accepting an assignment that is no longer pending', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.accept('u1', 'a1')).rejects.toThrow(DeliveryConflictException);
  });

  it('rejects an assignment with a reason and announces the rejection', async () => {
    const { service, db, audit, events } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.updateMany.mockResolvedValue({ count: 1 });
    db.deliveryAssignment.findUnique.mockResolvedValue(assignmentDetail('REJECTED'));

    await service.reject('u1', 'a1', { reason: 'Too far' });

    expect(db.deliveryAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Too far' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DELIVERY_REJECTED }),
      db,
    );
    expect(events.announce).toHaveBeenCalledWith(
      'b1',
      'delivery.assignment.rejected',
      'REJECTED',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('DeliveryAssignmentService.pickup / outForDelivery / deliver', () => {
  it('picks up an accepted assignment and advances the order to OUT_FOR_DELIVERY', async () => {
    const { service, db, audit, events } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ACCEPTED',
      orderId: 'o1',
    });
    db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'READY_FOR_PICKUP' });
    db.deliveryAssignment.update.mockResolvedValue({});
    db.order.update.mockResolvedValue({});
    db.deliveryAssignment.findUnique.mockResolvedValue(assignmentDetail('PICKED_UP'));

    await service.pickup('u1', 'a1');

    expect(db.deliveryAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PICKED_UP' }) }),
    );
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'OUT_FOR_DELIVERY' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DELIVERY_PICKED_UP }),
      db,
    );
    expect(events.announce).toHaveBeenCalledWith(
      'b1',
      'delivery.picked_up',
      'PICKED_UP',
      'a1',
      'o1',
      'HB-20260925-000001',
      ['cust-1'],
    );
  });

  it('rejects pickup when the assignment is not accepted', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ASSIGNED',
      orderId: 'o1',
    });

    await expect(service.pickup('u1', 'a1')).rejects.toThrow(DeliveryConflictException);
  });

  it('moves a picked-up assignment to OUT_FOR_DELIVERY', async () => {
    const { service, db, audit } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.updateMany.mockResolvedValue({ count: 1 });
    db.deliveryAssignment.findUnique.mockResolvedValue(assignmentDetail('OUT_FOR_DELIVERY'));

    await service.outForDelivery('u1', 'a1');

    expect(db.deliveryAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PICKED_UP' }),
        data: expect.objectContaining({ status: 'OUT_FOR_DELIVERY' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DELIVERY_OUT_FOR_DELIVERY }),
      db,
    );
  });

  it('delivers an out-for-delivery assignment, advances the order and returns partner ONLINE', async () => {
    const { service, db, audit, events } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'OUT_FOR_DELIVERY',
      orderId: 'o1',
    });
    db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'OUT_FOR_DELIVERY' });
    db.deliveryAssignment.update.mockResolvedValue({});
    db.order.update.mockResolvedValue({});
    db.deliveryPartnerProfile.update.mockResolvedValue({});
    db.deliveryAssignment.findUnique.mockResolvedValue(assignmentDetail('DELIVERED'));

    await service.deliver('u1', 'a1');

    expect(db.deliveryAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
    expect(db.deliveryPartnerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ availability: 'ONLINE' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: AuditKinds.DELIVERY_COMPLETED }),
      db,
    );
    expect(events.announce).toHaveBeenCalledWith(
      'b1',
      'delivery.delivered',
      'DELIVERED',
      'a1',
      'o1',
      'HB-20260925-000001',
      ['cust-1'],
    );
  });

  it('rejects delivery when the assignment is not out for delivery', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ACCEPTED',
      orderId: 'o1',
    });

    await expect(service.deliver('u1', 'a1')).rejects.toThrow(DeliveryConflictException);
  });
});

describe('DeliveryAssignmentService.myAssignments / getOwn', () => {
  it("lists the caller's assignments", async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.findMany.mockResolvedValue([
      {
        id: 'a1',
        status: 'ASSIGNED',
        assignedAt: new Date(),
        acceptedAt: null,
        deliveredAt: null,
        order: {
          orderNumber: 'HB-20260925-000001',
          totalMinor: 70800,
          branch: { city: 'Guntur' },
          address: { recipientName: 'Demo Customer', city: 'Guntur' },
        },
      },
    ]);

    const rows = await service.myAssignments('u1');

    expect(db.deliveryAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deliveryPartnerId: 'p1' }) }),
    );
    expect(rows[0]?.orderNumber).toBe('HB-20260925-000001');
  });

  it('returns 404 when the assignment is not owned by the caller', async () => {
    const { service, db } = buildService();
    db.deliveryPartnerProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    db.deliveryAssignment.findFirst.mockResolvedValue(null);

    await expect(service.getOwn('u1', 'other-a')).rejects.toThrow(NotFoundException);
  });
});

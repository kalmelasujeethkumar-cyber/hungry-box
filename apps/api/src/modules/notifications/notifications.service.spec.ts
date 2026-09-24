import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from './notifications.service';

function baseDb() {
  const db = {
    notification: {
      create: vi.fn().mockResolvedValue({
        id: 'n1',
        type: 'delivery.assignment.created',
        title: 'New delivery assignment',
        body: 'Order HB-20260925-000001',
        readAt: null,
        createdAt: new Date(),
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'n1',
        type: 'delivery.assignment.created',
        title: 'New delivery assignment',
        body: null,
        readAt: null,
        createdAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({
        id: 'n1',
        type: 'delivery.assignment.created',
        title: 'New delivery assignment',
        body: null,
        readAt: new Date(),
        createdAt: new Date(),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return db;
}

function buildService<T extends Record<string, unknown> = ReturnType<typeof baseDb>>() {
  const db = baseDb() as unknown as T;
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  const realtime = {
    emitToUser: vi.fn(),
  } as unknown as RealtimeGateway;
  const service = new NotificationsService(prisma, realtime);
  return { service, db, realtime, prisma };
}

describe('NotificationsService.notify', () => {
  it('persists the notification and pushes it via realtime', async () => {
    const { service, db, realtime } = buildService();

    const dto = await service.notify(
      'u1',
      'delivery.assignment.created',
      'New delivery assignment',
      'Order HB-20260925-000001',
    );

    expect(db.notification.create).toHaveBeenCalledWith({
      data: {
        recipientUserId: 'u1',
        type: 'delivery.assignment.created',
        title: 'New delivery assignment',
        body: 'Order HB-20260925-000001',
      },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'notification.created', dto);
    expect(dto.title).toBe('New delivery assignment');
    expect(dto.read).toBe(false);
  });
});

describe('NotificationsService.listForUser', () => {
  it('lists notifications for a user ordered by unread-then-newest', async () => {
    const { service, db } = buildService();
    db.notification.findMany.mockResolvedValue([
      {
        id: 'n2',
        type: 'delivery.delivered',
        title: 'Order delivered',
        body: null,
        readAt: null,
        createdAt: new Date(),
      },
    ]);

    const rows = await service.listForUser('u1');

    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientUserId: 'u1' },
        orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
    );
    expect(rows[0]?.type).toBe('delivery.delivered');
  });
});

describe('NotificationsService.markRead', () => {
  it('marks a recipient-owned notification read', async () => {
    const { service, db } = buildService();

    const dto = await service.markRead('u1', 'n1');

    expect(db.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n1' }, data: { readAt: expect.any(Date) } }),
    );
    expect(dto.read).toBe(true);
  });

  it('returns 404 for a notification owned by someone else', async () => {
    const { service, db } = buildService();
    db.notification.findFirst.mockResolvedValue(null);

    await expect(service.markRead('other-user', 'n1')).rejects.toThrow(NotFoundException);
  });
});

describe('NotificationsService.markAllRead', () => {
  it('marks all unread notifications read', async () => {
    const { service, db } = buildService();

    await service.markAllRead('u1');

    expect(db.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientUserId: 'u1', readAt: null },
        data: { readAt: expect.any(Date) },
      }),
    );
  });
});

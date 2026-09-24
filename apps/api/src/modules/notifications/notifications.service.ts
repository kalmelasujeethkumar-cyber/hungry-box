import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationDto } from '@hungrybox/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Persists a notification and pushes it to the recipient's realtime room. */
  async notify(
    userId: string,
    type: string,
    title: string,
    body?: string,
  ): Promise<NotificationDto> {
    const db = this.prisma.requireClient();
    const row = await db.notification.create({
      data: { recipientUserId: userId, type, title, body: body ?? null },
    });
    const dto = toNotificationDto(row);
    this.realtime.emitToUser(userId, 'notification.created', dto);
    return dto;
  }

  async listForUser(userId: string): Promise<NotificationDto[]> {
    const db = this.prisma.requireClient();
    const rows = await db.notification.findMany({
      where: { recipientUserId: userId },
      orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map(toNotificationDto);
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const db = this.prisma.requireClient();
    const existing = await db.notification.findFirst({
      where: { id: notificationId, recipientUserId: userId },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    const row = await db.notification.update({
      where: { id: notificationId },
      data: { readAt: existing.readAt ?? new Date() },
    });
    return toNotificationDto(row);
  }

  async markAllRead(userId: string): Promise<void> {
    const db = this.prisma.requireClient();
    await db.notification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

function toNotificationDto(row: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
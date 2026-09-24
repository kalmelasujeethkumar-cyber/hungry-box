import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload, UserRole } from '@hungrybox/shared';
import { UserStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';

const userRoom = (userId: string): string => `user:${userId}`;
const branchRoom = (branchId: string): string => `branch:${branchId}`;

/**
 * JWT-authenticated Socket.IO gateway. REST stays authoritative; this channel
 * only pushes read-model events for live updates. CORS is configured at the
 * Socket.IO server level (see CorsIoAdapter) so it mirrors CORS_ORIGINS.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server | undefined;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = this.tokenFrom(socket);
    const payload = token ? await this.resolvePayload(token) : null;
    if (!payload || !(await this.isOperational(payload.sub, payload.role))) {
      socket.disconnect(true);
      return;
    }
    socket.join(userRoom(payload.sub));
    if (payload.branchId) {
      socket.join(branchRoom(payload.branchId));
    }
  }

  handleDisconnect(socket: Socket): void {
    for (const room of socket.rooms) {
      if (room.startsWith('user:') || room.startsWith('branch:')) {
        socket.leave(room);
      }
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  emitToBranch(branchId: string, event: string, payload: unknown): void {
    this.server?.to(branchRoom(branchId)).emit(event, payload);
  }

  isConnected(): boolean {
    return this.server !== undefined;
  }

  private tokenFrom(socket: Socket): string | null {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.length > 0) {
      return auth.token;
    }
    if (typeof socket.handshake.query?.token === 'string') {
      return socket.handshake.query.token;
    }
    return null;
  }

  private async resolvePayload(token: string): Promise<JwtPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload.sub || !payload.role) {
        return null;
      }
      return payload;
    } catch {
      this.logger.warn('Realtime connection rejected: invalid token');
      return null;
    }
  }

  /**
   * An already-issued JWT keeps working only for a still-ACTIVE account.
   * Delivery partners additionally need their partner profile ACTIVE so a
   * suspended partner loses the live channel even with an old token.
   */
  private async isOperational(userId: string, role: UserRole): Promise<boolean> {
    const db = this.prisma.requireClient();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      return false;
    }
    if (role === 'DELIVERY_PARTNER') {
      const profile = await db.deliveryPartnerProfile.findUnique({
        where: { userId },
        select: { status: true },
      });
      return profile?.status === 'ACTIVE';
    }
    return true;
  }
}

import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

const userRoom = (userId: string): string => `user:${userId}`;
const branchRoom = (branchId: string): string => `branch:${branchId}`;

/**
 * JWT-authenticated Socket.IO gateway. REST stays authoritative; this channel
 * only pushes read-model events for live updates.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server | undefined;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = this.tokenFrom(socket);
    const payload = token ? await this.resolvePayload(token) : null;
    if (!payload) {
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

  private async resolvePayload(token: string): Promise<{ sub: string; branchId: string | null } | null> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; branchId: string | null }>(
        token,
      );
      return payload;
    } catch {
      this.logger.warn('Realtime connection rejected: invalid token');
      return null;
    }
  }
}
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

function makeSocket(): Socket {
  return {
    handshake: { auth: { token: 'jwt-token' }, query: {} },
    disconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    rooms: new Set<string>(),
  } as unknown as Socket;
}

function makeJwt(payload: unknown) {
  return { verifyAsync: vi.fn().mockResolvedValue(payload) } as unknown as JwtService;
}

function makePrisma(userResult: unknown, partnerStatus: string | null = null) {
  const user = { findUnique: vi.fn().mockResolvedValue(userResult) };
  const deliveryPartnerProfile = {
    findUnique: vi
      .fn()
      .mockResolvedValue(partnerStatus === null ? null : { status: partnerStatus }),
  };
  const client = { user, deliveryPartnerProfile };
  const prisma = { requireClient: () => client } as unknown as PrismaService;
  return { prisma, user };
}

describe('RealtimeGateway.handleConnection', () => {
  it('rejects connections with an invalid token', async () => {
    const gateway = new RealtimeGateway(makeJwt({ sub: 'u1' }), makePrisma(undefined).prisma);
    const socket = makeSocket();

    gateway.handleConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('joins the user and branch rooms for an ACTIVE user', async () => {
    const { prisma, user } = makePrisma({ id: 'u1', status: 'ACTIVE' });
    const gateway = new RealtimeGateway(
      makeJwt({ sub: 'u1', role: 'BRANCH_MANAGER', branchId: 'b1' }),
      prisma,
    );
    const socket = makeSocket();

    await gateway.handleConnection(socket);

    expect(user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, status: true },
    });
    expect(socket.join).toHaveBeenCalledWith('user:u1');
    expect(socket.join).toHaveBeenCalledWith('branch:b1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects when the user account is not ACTIVE', async () => {
    const { prisma } = makePrisma({ id: 'u1', status: 'SUSPENDED' });
    const gateway = new RealtimeGateway(
      makeJwt({ sub: 'u1', role: 'CUSTOMER', branchId: null }),
      prisma,
    );
    const socket = makeSocket();

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a delivery partner whose profile is not ACTIVE', async () => {
    const { prisma } = makePrisma({ id: 'u1', status: 'ACTIVE' }, 'SUSPENDED');
    const gateway = new RealtimeGateway(
      makeJwt({ sub: 'u1', role: 'DELIVERY_PARTNER', branchId: 'b1' }),
      prisma,
    );
    const socket = makeSocket();

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects a delivery partner whose profile is missing', async () => {
    const { prisma } = makePrisma({ id: 'u1', status: 'ACTIVE' }, null);
    const gateway = new RealtimeGateway(
      makeJwt({ sub: 'u1', role: 'DELIVERY_PARTNER', branchId: 'b1' }),
      prisma,
    );
    const socket = makeSocket();

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

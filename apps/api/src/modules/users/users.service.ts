import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@hungrybox/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicUser } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublicById(id: string): Promise<AuthUser> {
    const db = this.prisma.requireClient();
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async listPublicUsers(): Promise<AuthUser[]> {
    const db = this.prisma.requireClient();
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return users.map(toPublicUser);
  }
}

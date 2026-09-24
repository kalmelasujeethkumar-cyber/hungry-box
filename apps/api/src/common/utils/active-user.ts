import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '../../generated/prisma/enums';
import type { PrismaClient } from '../../generated/prisma/client';

export async function requireActiveUser(db: PrismaClient, userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException('Account is not active');
  }
}

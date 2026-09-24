import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@hungrybox/shared';
import { UserStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Privileged staff whose user account must still be ACTIVE for an already-issued
 * JWT to keep working. CUSTOMER and DELIVERY_PARTNER behaviour is unchanged.
 */
const STAFF_ROLES: ReadonlyArray<UserRole> = ['SUPER_ADMIN', 'BRANCH_MANAGER'];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Role not permitted');
    }
    if (STAFF_ROLES.includes(user.role)) {
      await this.ensureActive(user.sub);
    }
    return true;
  }

  private async ensureActive(userId: string): Promise<void> {
    const db = this.prisma.requireClient();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }
  }
}

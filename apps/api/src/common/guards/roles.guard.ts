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
import { ALLOW_INACTIVE_DELIVERY_PARTNER_KEY } from '../decorators/allow-inactive-delivery-partner.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Privileged roles whose user account must still be ACTIVE for an already-issued
 * JWT to keep working. CUSTOMER behaviour is unchanged, so suspending a customer
 * user only stops new logins, not existing sessions.
 */
const REVALIDATED_ROLES: ReadonlyArray<UserRole> = [
  'SUPER_ADMIN',
  'BRANCH_MANAGER',
  'DELIVERY_PARTNER',
];

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
    const allowInactiveDeliveryPartner = this.reflector.getAllAndOverride<boolean>(
      ALLOW_INACTIVE_DELIVERY_PARTNER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (REVALIDATED_ROLES.includes(user.role)) {
      await this.ensureActive(user.sub, user.role, allowInactiveDeliveryPartner === true);
    }
    return true;
  }

  private async ensureActive(
    userId: string,
    role: UserRole,
    allowInactiveDeliveryPartner = false,
  ): Promise<void> {
    const db = this.prisma.requireClient();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }
    if (role === 'DELIVERY_PARTNER' && !allowInactiveDeliveryPartner) {
      const profile = await db.deliveryPartnerProfile.findUnique({
        where: { userId },
        select: { id: true, status: true },
      });
      if (!profile || profile.status !== 'ACTIVE') {
        throw new ForbiddenException('Account is not active');
      }
    }
  }
}

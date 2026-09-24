import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request';
import { BRANCH_SCOPE_KEY } from '../decorators/branch-scope.decorator';

@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const param = this.reflector.getAllAndOverride<string>(BRANCH_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!param) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const candidate = request.params?.[param] ?? request.body?.[param] ?? request.query?.[param];
    if (candidate == null || candidate === '') {
      throw new ForbiddenException('Branch scope is required');
    }

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (user.role === 'SUPER_ADMIN') return true;
    if (user.role === 'CUSTOMER') {
      throw new ForbiddenException('Branch control is not available to customers');
    }
    if (user.branchId == null || user.branchId !== candidate) {
      throw new ForbiddenException('Branch access denied');
    }
    return true;
  }
}

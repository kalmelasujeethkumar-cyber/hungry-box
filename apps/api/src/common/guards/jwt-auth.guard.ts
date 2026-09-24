import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '@hungrybox/shared';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function isValidPayload(payload: unknown): payload is JwtPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<JwtPayload>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.role === 'string' &&
    (candidate.branchId === null || typeof candidate.branchId === 'string')
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: unknown;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!isValidPayload(payload)) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = {
      sub: payload.sub,
      role: payload.role,
      branchId: payload.branchId,
    };
    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}

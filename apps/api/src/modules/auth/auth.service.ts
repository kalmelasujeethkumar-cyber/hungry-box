import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashSync, verify } from '@node-rs/argon2';
import type { AuthUser, JwtPayload, LoginResponse } from '@hungrybox/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';
import { normalizeLoginId } from '../../common/utils/login-id';
import { toPublicUser } from '../users/user.mapper';
import type { LoginDto } from './dto/login.dto';

const DUMMY_HASH = hashSync('hungrybox-login-timing-equalizer', {
  memoryCost: 19456,
  timeCost: 2,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const db = this.prisma.requireClient();
    const loginId = normalizeLoginId(dto.loginId);

    const user = await db.user.findUnique({ where: { loginId } });
    if (!user) {
      await this.verifyWithTiming(dto.password);
      throw this.invalidCredentials(loginId);
    }

    const passwordValid = await verify(user.passwordHash, dto.password);
    if (!passwordValid || user.status !== UserStatus.ACTIVE) {
      throw this.invalidCredentials(loginId);
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      branchId: user.branchId,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log(`User id=${user.id} role=${user.role} logged in`);
    return { accessToken, user: toPublicUser(user) };
  }

  async me(userId: string): Promise<AuthUser> {
    const db = this.prisma.requireClient();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return toPublicUser(user);
  }

  private async verifyWithTiming(password: string): Promise<void> {
    try {
      await verify(DUMMY_HASH, password);
    } catch {
      // Argon2 rejects the dummy on purpose; the run is only for timing parity.
    }
  }

  private invalidCredentials(loginId: string): UnauthorizedException {
    this.logger.warn(`Login failed for loginId=${loginId}`);
    return new UnauthorizedException('Invalid credentials');
  }
}

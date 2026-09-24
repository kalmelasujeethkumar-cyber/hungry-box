import { hash, type Options as Argon2Options } from '@node-rs/argon2';
import { Role, UserStatus } from '../generated/prisma/enums';
import { normalizeLoginId } from '../common/utils/login-id';

/** Same Argon2 cost profile the login flow and seed use. */
export const PROVISION_ARGON2: Argon2Options = { memoryCost: 19456, timeCost: 2 };

export function hashProvisionPassword(password: string): Promise<string> {
  return hash(password, PROVISION_ARGON2);
}

export interface ProvisionAdminInput {
  loginId: string;
  password: string;
  name: string;
}

export type ProvisionAdminResult =
  | { outcome: 'created'; userId: string }
  | { outcome: 'already_active_super_admin'; userId: string }
  | { outcome: 'refused'; reason: string };

interface ExistingUser {
  id: string;
  role: string;
  status: string;
}

export interface ProvisionAdminDeps {
  findUserByLoginId(loginId: string): Promise<ExistingUser | null>;
  createUser(input: {
    loginId: string;
    name: string;
    passwordHash: string;
    role: Role;
    status: UserStatus;
  }): Promise<{ id: string }>;
  hashPassword?: (password: string) => Promise<string>;
}

export async function provisionSuperAdmin(
  input: ProvisionAdminInput,
  deps: ProvisionAdminDeps,
): Promise<ProvisionAdminResult> {
  const loginId = normalizeLoginId(input.loginId);
  const existing = await deps.findUserByLoginId(loginId);

  if (existing) {
    if (existing.role !== Role.SUPER_ADMIN) {
      return {
        outcome: 'refused',
        reason:
          'A user with this login id already exists and is not a SUPER_ADMIN; refusing to promote or modify an existing account',
      };
    }
    if (existing.status !== UserStatus.ACTIVE) {
      return {
        outcome: 'refused',
        reason: `The existing SUPER_ADMIN is ${existing.status.toLowerCase()}; refusing to reactivate it automatically`,
      };
    }
    return { outcome: 'already_active_super_admin', userId: existing.id };
  }

  const passwordHash = await (deps.hashPassword ?? hashProvisionPassword)(input.password);
  const created = await deps.createUser({
    loginId,
    name: input.name.trim(),
    passwordHash,
    role: Role.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
  });
  return { outcome: 'created', userId: created.id };
}

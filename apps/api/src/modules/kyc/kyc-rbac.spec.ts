import { describe, expect, it } from 'vitest';
import { ALLOW_INACTIVE_DELIVERY_PARTNER_KEY } from '../../common/decorators/allow-inactive-delivery-partner.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BranchKycController } from './branch-kyc.controller';
import { PartnerKycController } from './partner-kyc.controller';

function methodRoles(target: object, method: PropertyKey): string[] {
  const value = (target as Record<PropertyKey, unknown>)[method];
  const methodRoles = Reflect.getMetadata(ROLES_KEY, value as object) as string[] | undefined;
  const constructor = (target as { constructor: object }).constructor;
  const classRoles = Reflect.getMetadata(ROLES_KEY, constructor) as string[] | undefined;
  return methodRoles ?? classRoles ?? [];
}

function methodAllowsInactive(target: object, method: PropertyKey): boolean {
  const value = (target as Record<PropertyKey, unknown>)[method];
  return Reflect.getMetadata(ALLOW_INACTIVE_DELIVERY_PARTNER_KEY, value as object) === true;
}

describe('KYC RBAC metadata', () => {
  describe('PartnerKycController (delivery/kyc)', () => {
    it('serves DELIVERY_PARTNER only', () => {
      for (const method of ['status', 'upload', 'access']) {
        const roles = methodRoles(PartnerKycController.prototype, method);
        expect(roles).toEqual(['DELIVERY_PARTNER']);
      }
    });

    it('opens the opt-out on every partner KYC route so non-ACTIVE partners can self-serve', () => {
      for (const method of ['status', 'upload', 'access']) {
        expect(methodAllowsInactive(PartnerKycController.prototype, method)).toBe(true);
      }
    });
  });

  describe('BranchKycController (branch/kyc)', () => {
    it('serves SUPER_ADMIN and BRANCH_MANAGER for read and access routes', () => {
      for (const method of ['list', 'get', 'access']) {
        const roles = methodRoles(BranchKycController.prototype, method);
        expect(roles).toEqual(['SUPER_ADMIN', 'BRANCH_MANAGER']);
        expect(roles).not.toContain('DELIVERY_PARTNER');
        expect(roles).not.toContain('CUSTOMER');
      }
    });

    it('restricts review decisions to BRANCH_MANAGER only', () => {
      expect(methodRoles(BranchKycController.prototype, 'review')).toEqual(['BRANCH_MANAGER']);
    });

    it('does not apply the partner opt-out to manager routes', () => {
      for (const method of ['list', 'get', 'access', 'review']) {
        expect(methodAllowsInactive(BranchKycController.prototype, method)).toBe(false);
      }
    });
  });
});
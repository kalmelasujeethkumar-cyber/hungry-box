import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BranchProductsController } from '../branch-products/branch-products.controller';
import { CategoriesController } from '../categories/categories.controller';
import { ProductsController } from '../products/products.controller';

function methodRoles(target: unknown, method: PropertyKey): string[] {
  const value = (target as Record<PropertyKey, unknown>)[method];
  return (Reflect.getMetadata(ROLES_KEY, value as object) ?? []) as string[];
}

describe('Public catalog media RBAC metadata', () => {
  describe('ProductsController product image endpoints', () => {
    it('marks every media mutation as SUPER_ADMIN only', () => {
      expect(methodRoles(ProductsController.prototype, 'uploadImage')).toEqual(['SUPER_ADMIN']);
      expect(methodRoles(ProductsController.prototype, 'setPrimaryImage')).toEqual(['SUPER_ADMIN']);
      expect(methodRoles(ProductsController.prototype, 'reorderImages')).toEqual(['SUPER_ADMIN']);
      expect(methodRoles(ProductsController.prototype, 'removeImage')).toEqual(['SUPER_ADMIN']);
    });

    it('never grants BRANCH_MANAGER, DELIVERY_PARTNER or CUSTOMER media access', () => {
      const methods = ['uploadImage', 'setPrimaryImage', 'reorderImages', 'removeImage'];
      for (const method of methods) {
        const roles = methodRoles(ProductsController.prototype, method);
        expect(roles).not.toContain('BRANCH_MANAGER');
        expect(roles).not.toContain('DELIVERY_PARTNER');
        expect(roles).not.toContain('CUSTOMER');
      }
    });

    it('keeps global product reads SUPER_ADMIN only', () => {
      expect(methodRoles(ProductsController.prototype, 'listAdmin')).toEqual(['SUPER_ADMIN']);
      expect(methodRoles(ProductsController.prototype, 'getAdmin')).toEqual(['SUPER_ADMIN']);
    });
  });

  describe('CategoriesController category image endpoints', () => {
    it('marks media mutation endpoints as SUPER_ADMIN only', () => {
      expect(methodRoles(CategoriesController.prototype, 'uploadImage')).toEqual(['SUPER_ADMIN']);
      expect(methodRoles(CategoriesController.prototype, 'removeImage')).toEqual(['SUPER_ADMIN']);
    });

    it('never grants BRANCH_MANAGER media access', () => {
      const roles = [
        ...methodRoles(CategoriesController.prototype, 'uploadImage'),
        ...methodRoles(CategoriesController.prototype, 'removeImage'),
      ];
      expect(roles).not.toContain('BRANCH_MANAGER');
      expect(roles).not.toContain('DELIVERY_PARTNER');
      expect(roles).not.toContain('CUSTOMER');
    });
  });

  describe('BranchProductsController branch-owned media endpoints', () => {
    const branchMediaMethods = ['uploadImage', 'setPrimaryImage', 'reorderImages', 'removeImage'];

    it('grants exactly SUPER_ADMIN and BRANCH_MANAGER', () => {
      for (const method of branchMediaMethods) {
        expect(methodRoles(BranchProductsController.prototype, method)).toEqual([
          'SUPER_ADMIN',
          'BRANCH_MANAGER',
        ]);
      }
    });

    it('never grants CUSTOMER or DELIVERY_PARTNER branch media access', () => {
      for (const method of branchMediaMethods) {
        const roles = methodRoles(BranchProductsController.prototype, method);
        expect(roles).not.toContain('CUSTOMER');
        expect(roles).not.toContain('DELIVERY_PARTNER');
      }
    });

    it('does not widen any existing branch product endpoint to other roles', () => {
      for (const method of ['list', 'create', 'update', 'remove']) {
        const roles = methodRoles(BranchProductsController.prototype, method);
        expect(roles).not.toContain('CUSTOMER');
        expect(roles).not.toContain('DELIVERY_PARTNER');
      }
    });
  });
});

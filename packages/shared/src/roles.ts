export const USER_ROLES = [
  'SUPER_ADMIN',
  'BRANCH_MANAGER',
  'DELIVERY_PARTNER',
  'CUSTOMER',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

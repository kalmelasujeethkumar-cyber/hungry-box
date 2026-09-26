export const HOME_PATH = '/';

export const LOGIN_PATH = '/login';

/**
 * Single management entry point. Unauthenticated visitors are shown the
 * management login here; authenticated management roles are forwarded to
 * MANAGEMENT_DASHBOARD_PATH.
 */
export const MANAGEMENT_BASE_PATH = '/admin';

/** Role-aware management home: Super Admin or Branch Manager dashboard. */
export const MANAGEMENT_DASHBOARD_PATH = '/admin/dashboard';

// Super Admin management segments.
export const ADMIN_BRANCHES_PATH = '/admin/branches';
export const ADMIN_ORDERS_PATH = '/admin/orders';
export const ADMIN_CATALOGUE_PATH = '/admin/catalogue';
export const ADMIN_MANAGERS_PATH = '/admin/managers';
export const ADMIN_PARTNERS_PATH = '/admin/partners';
export const ADMIN_AUDIT_PATH = '/admin/audit';
export const ADMIN_REPORTS_PATH = '/admin/reports';

// Branch Manager management segments.
export const BRANCH_BASE_PATH = '/admin/branch';
export const BRANCH_ORDERS_PATH = '/admin/branch/orders';
export const BRANCH_ORDERS_DETAIL_PATH = '/admin/branch/orders/:orderId';
export const BRANCH_CATALOGUE_PATH = '/admin/branch/catalogue';
export const BRANCH_PARTNERS_PATH = '/admin/branch/partners';
export const BRANCH_PARTNERS_DETAIL_PATH = '/admin/branch/partners/:partnerId';
export const BRANCH_ASSIGNMENTS_PATH = '/admin/branch/assignments';
export const BRANCH_SETTINGS_PATH = '/admin/branch/settings';
export const BRANCH_AUDIT_PATH = '/admin/branch/audit';

/**
 * Legacy Branch Manager URLs. These are redirect-only: no management login is
 * exposed here, they resolve to the /admin/branch equivalents.
 */
export const LEGACY_MANAGER_BASE_PATH = '/manager';
export const LEGACY_MANAGER_ORDERS_PATH = '/manager/orders';
export const LEGACY_MANAGER_CATALOG_PATH = '/manager/catalog';
export const LEGACY_MANAGER_PARTNERS_PATH = '/manager/partners';
export const LEGACY_MANAGER_ASSIGNMENTS_PATH = '/manager/assignments';
export const LEGACY_MANAGER_SETTINGS_PATH = '/manager/settings';
export const LEGACY_MANAGER_AUDIT_PATH = '/manager/audit';

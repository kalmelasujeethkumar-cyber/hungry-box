export const AUDIT_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  BRANCH_MANAGER: 'Branch manager',
  DELIVERY_PARTNER: 'Delivery partner',
  CUSTOMER: 'Customer',
};

export function auditRoleLabel(role: string): string {
  return AUDIT_ROLE_LABELS[role] ?? role;
}

export const AUDIT_KIND_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Order created',
  PAYMENT_INITIATED: 'Payment initiated',
  PAYMENT_VERIFIED: 'Payment verified',
  PAYMENT_FAILED: 'Payment failed',
  ORDER_STATUS_CHANGED: 'Order status changed',
  ORDER_CANCELLED: 'Order cancelled',
  CHECKOUT_CONFLICT: 'Checkout conflict',
  IDEMPOTENCY_REPLAY: 'Idempotency replay',
  BRANCH_PRODUCT_CREATED: 'Product configured',
  BRANCH_PRODUCT_UPDATED: 'Product updated',
  BRANCH_PRODUCT_DEACTIVATED: 'Product deactivated',
  BRANCH_SETTINGS_UPDATED: 'Settings updated',
  PARTNER_CREATED: 'Delivery partner created',
  PARTNER_STATUS_CHANGED: 'Partner status changed',
  PARTNER_AVAILABILITY_CHANGED: 'Partner availability changed',
  PARTNER_VERIFIED: 'Partner verified',
  DOCUMENT_REVIEWED: 'Document reviewed',
  KYC_DOCUMENT_UPLOADED: 'KYC document uploaded',
  KYC_DOCUMENT_REUPLOADED: 'KYC document re-uploaded',
  KYC_DOCUMENT_VIEWED: 'KYC document viewed',
  KYC_DOCUMENT_VERIFIED: 'KYC document verified',
  KYC_DOCUMENT_REJECTED: 'KYC document rejected',
  KYC_CLEANUP_FAILED: 'KYC cleanup failed',
  DELIVERY_ASSIGNED: 'Delivery assigned',
  DELIVERY_ACCEPTED: 'Delivery accepted',
  DELIVERY_REJECTED: 'Delivery rejected',
  DELIVERY_CANCELLED: 'Delivery cancelled',
  DELIVERY_PICKED_UP: 'Delivery picked up',
  DELIVERY_OUT_FOR_DELIVERY: 'Order out for delivery',
  DELIVERY_COMPLETED: 'Delivery completed',
  DELIVERY_LOCATION_UPDATED: 'Delivery location updated',
  COD_ORDER_CREATED: 'Cash-on-delivery order',
  COD_COLLECTED: 'Cash collected',
  COD_COLLECTION_CORRECTED: 'Cash collection corrected',
  COD_COLLECTION_FAILED: 'Cash collection failed',
  BRANCH_UPDATED: 'Branch updated',
  BRANCH_STATUS_CHANGED: 'Branch status changed',
  USER_CREATED: 'User created',
  USER_STATUS_CHANGED: 'User status changed',
  PRODUCT_CREATED: 'Global product created',
  PRODUCT_UPDATED: 'Global product updated',
  PRODUCT_STATUS_CHANGED: 'Global product status changed',
  PRODUCT_IMAGE_ADDED: 'Product image added',
  PRODUCT_IMAGE_UPDATED: 'Product image updated',
  PRODUCT_IMAGE_REMOVED: 'Product image removed',
  PRODUCT_IMAGE_UPLOADED: 'Product image uploaded',
  PRODUCT_IMAGE_PRIMARY_CHANGED: 'Primary image changed',
  PRODUCT_IMAGES_REORDERED: 'Product images reordered',
  CATEGORY_IMAGE_UPLOADED: 'Category image uploaded',
  CATEGORY_IMAGE_REPLACED: 'Category image replaced',
  CATEGORY_IMAGE_REMOVED: 'Category image removed',
  MEDIA_CLEANUP_FAILED: 'Media cleanup failed',
  CATEGORY_CREATED: 'Category created',
  CATEGORY_UPDATED: 'Category updated',
  CATEGORY_STATUS_CHANGED: 'Category status changed',
};

export function auditKindLabel(kind: string): string {
  return AUDIT_KIND_LABELS[kind] ?? kind.replace(/_/g, ' ').toLowerCase();
}

export const AUDIT_KIND_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'All kinds' },
  ...Object.entries(AUDIT_KIND_LABELS).map(([value, label]) => ({ value, label })),
];

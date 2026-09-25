import type {
  AddressDto,
  AdminDashboardQuery,
  AdminReportQuery,
  AssignOrderInput,
  AuditListQuery,
  AuditListResultDto,
  AuthUser,
  BranchDto,
  BranchProductDto,
  CancelOrderInput,
  CartSummary,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDetail,
  CategoryDto,
  CheckoutPreviewDto,
  CreateAddressInput,
  CreateCategoryInput,
  CreateCodOrderInput,
  CreateDeliveryPartnerInput,
  CreateDeliveryPartnerResultDto,
  CreateManagerInput,
  CreateManagerResultDto,
  CreateOrderInput,
  CreatePaymentIntentInput,
  DashboardSummaryDto,
  DeliverAssignmentInput,
  DeliveryAssignmentDto,
  DeliveryAssignmentListItemDto,
  DeliveryAssignmentStatus,
  DeliveryPartnerCandidateDto,
  DeliveryPartnerListItemDto,
  DeliveryPartnerProfileDto,
  DeliveryTrackingDto,
  DevPaymentSimulateInput,
  GlobalProductDetailDto,
  GlobalProductListItemDto,
  LoginResponse,
  NotificationDto,
  OrderDetailDto,
  OrderStatus,
  OrderSummaryDto,
  PaymentIntentDto,
  ReorderProductImagesInput,
  ReviewPartnerDocumentInput,
  ServiceabilityResult,
  SetBranchStatusInput,
  SetDeliveryPartnerStatusInput,
  SetProductStatusInput,
  SetUserStatusInput,
  UpdateAddressInput,
  UpdateBranchInput,
  UpdateBranchProductInput,
  UpdateBranchSettingsInput,
  UpdateCategoryInput,
  UpdateDeliveryLocationInput,
  UpdateDeliveryPartnerInput,
  UpdateProductInput,
  UpsertPartnerDocumentInput,
  UserListQuery,
  UserListResultDto,
  VerifyDeliveryPartnerInput,
  VerifyPaymentInput,
  VerifyPaymentResultDto,
} from '@hungrybox/shared';
import type { CatalogQueryDto } from './query';
import { notifySessionExpired } from './session-expiry';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

interface ErrorPayload {
  message?: string | string[];
  error?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details: Record<string, unknown> | null;

  constructor(message: string, status: number, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Unable to reach the server', 0);
  }

  if (!response.ok) {
    if (response.status === 401 && options.token) {
      notifySessionExpired();
    }
    const { message, details } = await extractErrorPayload(response);
    throw new ApiError(message, response.status, details);
  }

  const text = await response.text();
  return (text ? (JSON.parse(text) as T) : undefined) as T;
}

export async function apiRequestText(
  path: string,
  options: ApiRequestOptions = {},
): Promise<string> {
  const headers: Record<string, string> = { Accept: 'text/csv,*/*' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
    });
  } catch {
    throw new ApiError('Unable to reach the server', 0);
  }

  if (!response.ok) {
    if (response.status === 401 && options.token) {
      notifySessionExpired();
    }
    const { message, details } = await extractErrorPayload(response);
    throw new ApiError(message, response.status, details);
  }

  return response.text();
}

export async function uploadRequest<T>(path: string, form: FormData, token: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: form,
    });
  } catch {
    throw new ApiError('Unable to reach the server', 0);
  }

  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired();
    }
    const { message, details } = await extractErrorPayload(response);
    throw new ApiError(message, response.status, details);
  }

  const text = await response.text();
  return (text ? (JSON.parse(text) as T) : undefined) as T;
}

async function extractErrorPayload(
  response: Response,
): Promise<{ message: string; details: Record<string, unknown> | null }> {
  try {
    const payload = (await response.json()) as Record<string, unknown> & ErrorPayload;
    let message: string;
    if (Array.isArray(payload.message)) message = payload.message.join(', ');
    else if (typeof payload.message === 'string' && payload.message) message = payload.message;
    else if (typeof payload.error === 'string' && payload.error) message = payload.error;
    else message = response.statusText || 'Request failed';
    return { message, details: payload };
  } catch {
    return { message: response.statusText || 'Request failed', details: null };
  }
}

function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const authApi = {
  login: (loginId: string, password: string) =>
    apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { loginId, password },
    }),
  me: (token: string) => apiRequest<AuthUser>('/auth/me', { token }),
};

export const catalogApi = {
  listProducts: (query: CatalogQueryDto, token: string) =>
    apiRequest<CatalogProduct[]>(`/catalog/products${queryString(query)}`, { token }),
  listCategories: (branchId: string, token: string) =>
    apiRequest<CatalogCategory[]>(`/catalog/categories?branchId=${branchId}`, { token }),
  getProduct: (productId: string, branchId: string, token: string) =>
    apiRequest<CatalogProductDetail>(`/catalog/products/${productId}${queryString({ branchId })}`, {
      token,
    }),
};

export const locationsApi = {
  serviceability: (latitude: number, longitude: number, token: string) =>
    apiRequest<ServiceabilityResult>('/locations/serviceability', {
      method: 'POST',
      body: { latitude, longitude },
      token,
    }),
};

export const addressApi = {
  list: (token: string) => apiRequest<AddressDto[]>('/addresses', { token }),
  get: (id: string, token: string) => apiRequest<AddressDto>(`/addresses/${id}`, { token }),
  create: (input: CreateAddressInput, token: string) =>
    apiRequest<AddressDto>('/addresses', { method: 'POST', body: input, token }),
  update: (id: string, input: UpdateAddressInput, token: string) =>
    apiRequest<AddressDto>(`/addresses/${id}`, { method: 'PATCH', body: input, token }),
  setDefault: (id: string, token: string) =>
    apiRequest<AddressDto>(`/addresses/${id}/default`, { method: 'PATCH', token }),
  delete: (id: string, token: string) =>
    apiRequest<{ id: string; deleted: true }>(`/addresses/${id}`, { method: 'DELETE', token }),
};

export const cartApi = {
  get: (branchId: string, token: string) =>
    apiRequest<CartSummary>(`/cart?branchId=${branchId}`, { token }),
  addItem: (branchId: string, productId: string, quantity: number, token: string) =>
    apiRequest<CartSummary>('/cart/items', {
      method: 'POST',
      body: { branchId, productId, quantity },
      token,
    }),
  updateItem: (itemId: string, quantity: number, token: string) =>
    apiRequest<CartSummary>(`/cart/items/${itemId}`, {
      method: 'PATCH',
      body: { quantity },
      token,
    }),
  removeItem: (itemId: string, token: string) =>
    apiRequest<CartSummary>(`/cart/items/${itemId}`, { method: 'DELETE', token }),
  clear: (branchId: string, token: string) =>
    apiRequest<CartSummary>(`/cart?branchId=${branchId}`, { method: 'DELETE', token }),
};

export const checkoutApi = {
  preview: (addressId: string, token: string) =>
    apiRequest<CheckoutPreviewDto>('/checkout/preview', {
      method: 'POST',
      body: { addressId },
      token,
    }),
  paymentIntent: (input: CreatePaymentIntentInput, token: string) =>
    apiRequest<PaymentIntentDto>('/checkout/payment-intent', {
      method: 'POST',
      body: input,
      token,
    }),
};

export const paymentsApi = {
  verify: (input: VerifyPaymentInput, token: string) =>
    apiRequest<VerifyPaymentResultDto>('/payments/verify', {
      method: 'POST',
      body: input,
      token,
    }),
  devSimulate: (input: DevPaymentSimulateInput, token: string) =>
    apiRequest<void>('/payments/dev/simulate', {
      method: 'POST',
      body: input,
      token,
    }),
};

export const ordersApi = {
  list: (token: string, status?: OrderStatus) =>
    apiRequest<OrderSummaryDto[]>(`/orders${queryString(status ? { status } : {})}`, { token }),
  get: (id: string, token: string) => apiRequest<OrderDetailDto>(`/orders/${id}`, { token }),
  create: (input: CreateOrderInput, token: string) =>
    apiRequest<OrderDetailDto>('/orders', { method: 'POST', body: input, token }),
  createCod: (input: CreateCodOrderInput, token: string) =>
    apiRequest<OrderDetailDto>('/orders/cod', { method: 'POST', body: input, token }),
  cancel: (id: string, input: CancelOrderInput, token: string) =>
    apiRequest<OrderDetailDto>(`/orders/${id}/cancel`, { method: 'POST', body: input, token }),
};

export const deliveryPartnerApi = {
  profile: (token: string) => apiRequest<DeliveryPartnerProfileDto>('/delivery/profile', { token }),
  setAvailability: (availability: 'ONLINE' | 'OFFLINE', token: string) =>
    apiRequest<DeliveryPartnerProfileDto>('/delivery/availability', {
      method: 'POST',
      body: { availability },
      token,
    }),
  updateLocation: (input: UpdateDeliveryLocationInput, token: string) =>
    apiRequest<{ recordedAt: string }>('/delivery/location', {
      method: 'POST',
      body: input,
      token,
    }),
  myAssignments: (token: string, status?: DeliveryAssignmentStatus) =>
    apiRequest<DeliveryAssignmentListItemDto[]>(
      `/delivery/assignments${queryString(status ? { status } : {})}`,
      { token },
    ),
  getAssignment: (assignmentId: string, token: string) =>
    apiRequest<DeliveryAssignmentDto>(`/delivery/assignments/${assignmentId}`, { token }),
  accept: (assignmentId: string, token: string) =>
    apiRequest<DeliveryAssignmentDto>(`/delivery/assignments/${assignmentId}/accept`, {
      method: 'POST',
      token,
    }),
  reject: (assignmentId: string, reason: string | undefined, token: string) =>
    apiRequest<DeliveryAssignmentDto>(`/delivery/assignments/${assignmentId}/reject`, {
      method: 'POST',
      body: { reason },
      token,
    }),
  pickup: (assignmentId: string, token: string) =>
    apiRequest<DeliveryAssignmentDto>(`/delivery/assignments/${assignmentId}/pickup`, {
      method: 'POST',
      token,
    }),
  outForDelivery: (assignmentId: string, token: string) =>
    apiRequest<DeliveryAssignmentDto>(`/delivery/assignments/${assignmentId}/out-for-delivery`, {
      method: 'POST',
      token,
    }),
  deliver: (assignmentId: string, token: string, cashCollected?: boolean) =>
    apiRequest<DeliveryAssignmentDto>(`/delivery/assignments/${assignmentId}/deliver`, {
      method: 'POST',
      body:
        cashCollected === undefined
          ? undefined
          : ({ cashCollected } satisfies DeliverAssignmentInput),
      token,
    }),
};

export const branchOrdersApi = {
  list: (token: string, status?: OrderStatus) =>
    apiRequest<OrderSummaryDto[]>(`/branch/orders${queryString(status ? { status } : {})}`, {
      token,
    }),
  listGlobal: (
    token: string,
    query: { branchId?: string; status?: OrderStatus; from?: string; to?: string },
  ) => apiRequest<OrderSummaryDto[]>(`/branch/orders${queryString(query)}`, { token }),
  get: (orderId: string, token: string) =>
    apiRequest<OrderDetailDto>(`/branch/orders/${orderId}`, { token }),
  advanceStatus: (orderId: string, status: OrderStatus, token: string) =>
    apiRequest<OrderDetailDto>(`/branch/orders/${orderId}/status`, {
      method: 'POST',
      body: { status },
      token,
    }),
  cancel: (orderId: string, reason: string | undefined, token: string) =>
    apiRequest<OrderDetailDto>(`/branch/orders/${orderId}/cancel`, {
      method: 'POST',
      body: { reason },
      token,
    }),
  collectCod: (orderId: string, reason: string, token: string) =>
    apiRequest<OrderDetailDto>(`/branch/orders/${orderId}/collect-cod`, {
      method: 'POST',
      body: { reason },
      token,
    }),
};

export const branchProductsApi = {
  list: (branchId: string, token: string) =>
    apiRequest<BranchProductDto[]>(`/branch-products?branchId=${branchId}`, { token }),
  create: (
    input: {
      branchId: string;
      productId: string;
      priceMinor: number;
      discountMinor?: number;
      isAvailable?: boolean;
    },
    token: string,
  ) => apiRequest<BranchProductDto>('/branch-products', { method: 'POST', body: input, token }),
  update: (branchProductId: string, input: UpdateBranchProductInput, token: string) =>
    apiRequest<BranchProductDto>(`/branch-products/${branchProductId}`, {
      method: 'PATCH',
      body: input,
      token,
    }),
  deactivate: (branchProductId: string, token: string) =>
    apiRequest<BranchProductDto>(`/branch-products/${branchProductId}`, {
      method: 'DELETE',
      token,
    }),
};

export const branchSettingsApi = {
  get: (token: string, branchId?: string | null) =>
    apiRequest<BranchDto>(`/branch/settings${queryString(branchId ? { branchId } : {})}`, {
      token,
    }),
  update: (input: UpdateBranchSettingsInput, token: string, branchId?: string | null) =>
    apiRequest<BranchDto>(`/branch/settings${queryString(branchId ? { branchId } : {})}`, {
      method: 'PATCH',
      body: input,
      token,
    }),
};

export const branchAuditApi = {
  list: (query: AuditListQuery, token: string) =>
    apiRequest<AuditListResultDto>(`/branch/audit${queryString(query)}`, { token }),
  exportCsv: (query: AuditListQuery, token: string) =>
    apiRequestText(`/branch/audit/export${queryString(query)}`, { token }),
};

export const branchDeliveryApi = {
  listPartners: (
    token: string,
    query?: { status?: string; availability?: string; search?: string; branchId?: string },
  ) =>
    apiRequest<DeliveryPartnerListItemDto[]>(`/branch/partners${queryString(query ?? {})}`, {
      token,
    }),
  getPartner: (partnerId: string, token: string) =>
    apiRequest<DeliveryPartnerProfileDto>(`/branch/partners/${partnerId}`, { token }),
  createPartner: (input: CreateDeliveryPartnerInput, token: string) =>
    apiRequest<CreateDeliveryPartnerResultDto>('/branch/partners', {
      method: 'POST',
      body: input,
      token,
    }),
  updatePartner: (partnerId: string, input: UpdateDeliveryPartnerInput, token: string) =>
    apiRequest<DeliveryPartnerProfileDto>(`/branch/partners/${partnerId}`, {
      method: 'PATCH',
      body: input,
      token,
    }),
  setPartnerStatus: (partnerId: string, input: SetDeliveryPartnerStatusInput, token: string) =>
    apiRequest<DeliveryPartnerProfileDto>(`/branch/partners/${partnerId}/status`, {
      method: 'POST',
      body: input,
      token,
    }),
  verifyPartner: (partnerId: string, input: VerifyDeliveryPartnerInput, token: string) =>
    apiRequest<DeliveryPartnerProfileDto>(`/branch/partners/${partnerId}/verify`, {
      method: 'POST',
      body: input,
      token,
    }),
  upsertPartnerDocument: (partnerId: string, input: UpsertPartnerDocumentInput, token: string) =>
    apiRequest<DeliveryPartnerProfileDto>(`/branch/partners/${partnerId}/documents`, {
      method: 'POST',
      body: input,
      token,
    }),
  reviewPartnerDocument: (
    partnerId: string,
    documentId: string,
    input: ReviewPartnerDocumentInput,
    token: string,
  ) =>
    apiRequest<DeliveryPartnerProfileDto>(
      `/branch/partners/${partnerId}/documents/${documentId}/review`,
      { method: 'POST', body: input, token },
    ),
  candidates: (token: string, branchId?: string) =>
    apiRequest<DeliveryPartnerCandidateDto[]>(
      `/branch/partners/candidates${queryString(branchId ? { branchId } : {})}`,
      { token },
    ),
  listAssignments: (token: string, status?: DeliveryAssignmentStatus) =>
    apiRequest<DeliveryAssignmentListItemDto[]>(
      `/branch/assignments${queryString(status ? { status } : {})}`,
      { token },
    ),
  assign: (orderId: string, input: AssignOrderInput, token: string) =>
    apiRequest<DeliveryAssignmentDto>(`/branch/orders/${orderId}/assign`, {
      method: 'POST',
      body: input,
      token,
    }),
  cancelAssignment: (
    orderId: string,
    assignmentId: string,
    reason: string | undefined,
    token: string,
  ) =>
    apiRequest<DeliveryAssignmentDto>(
      `/branch/orders/${orderId}/assignments/${assignmentId}/cancel`,
      {
        method: 'POST',
        body: { reason },
        token,
      },
    ),
};

export const deliveryTrackingApi = {
  get: (orderId: string, token: string) =>
    apiRequest<DeliveryTrackingDto>(`/orders/${orderId}/delivery-tracking`, { token }),
};

export const notificationsApi = {
  list: (token: string) => apiRequest<NotificationDto[]>('/notifications', { token }),
  markRead: (notificationId: string, token: string) =>
    apiRequest<NotificationDto>(`/notifications/${notificationId}/read`, {
      method: 'POST',
      token,
    }),
  markAllRead: (token: string) =>
    apiRequest<void>('/notifications/read-all', { method: 'POST', token }),
};

export const branchesApi = {
  list: (token: string) => apiRequest<BranchDto[]>('/branches', { token }),
  get: (id: string, token: string) => apiRequest<BranchDto>(`/branches/${id}`, { token }),
  update: (id: string, input: UpdateBranchInput, token: string) =>
    apiRequest<BranchDto>(`/branches/${id}`, { method: 'PATCH', body: input, token }),
  setStatus: (id: string, input: SetBranchStatusInput, token: string) =>
    apiRequest<BranchDto>(`/branches/${id}/status`, { method: 'PATCH', body: input, token }),
};

export const usersApi = {
  list: (query: UserListQuery, token: string) =>
    apiRequest<UserListResultDto>(`/users${queryString(query)}`, { token }),
  createManager: (input: CreateManagerInput, token: string) =>
    apiRequest<CreateManagerResultDto>('/users/managers', {
      method: 'POST',
      body: input,
      token,
    }),
  setStatus: (id: string, input: SetUserStatusInput, token: string) =>
    apiRequest<UserListResultDto['items'][number]>(`/users/${id}/status`, {
      method: 'PATCH',
      body: input,
      token,
    }),
};

export const productsApi = {
  listAdmin: (token: string) =>
    apiRequest<GlobalProductListItemDto[]>('/products/admin', { token }),
  getAdmin: (id: string, token: string) =>
    apiRequest<GlobalProductDetailDto>(`/products/admin/${id}`, { token }),
  create: (
    input: { name: string; slug: string; description?: string; categoryId?: string },
    token: string,
  ) => apiRequest<GlobalProductDetailDto>('/products', { method: 'POST', body: input, token }),
  update: (id: string, input: UpdateProductInput, token: string) =>
    apiRequest<GlobalProductDetailDto>(`/products/${id}`, {
      method: 'PATCH',
      body: input,
      token,
    }),
  setStatus: (id: string, input: SetProductStatusInput, token: string) =>
    apiRequest<GlobalProductDetailDto>(`/products/${id}/status`, {
      method: 'PATCH',
      body: input,
      token,
    }),
  uploadImage: (id: string, file: File, altText: string | undefined, token: string) => {
    const form = new FormData();
    form.append('file', file);
    if (altText) form.append('altText', altText);
    return uploadRequest<GlobalProductDetailDto>(`/products/${id}/images`, form, token);
  },
  setPrimaryImage: (imageId: string, token: string) =>
    apiRequest<GlobalProductDetailDto>(`/products/images/${imageId}/primary`, {
      method: 'PATCH',
      token,
    }),
  reorderImages: (input: ReorderProductImagesInput, token: string) =>
    apiRequest<GlobalProductDetailDto>('/products/images/reorder', {
      method: 'PATCH',
      body: input,
      token,
    }),
  removeImage: (imageId: string, token: string) =>
    apiRequest<GlobalProductDetailDto>(`/products/images/${imageId}`, {
      method: 'DELETE',
      token,
    }),
};

export const categoriesApi = {
  listAdmin: (token: string) => apiRequest<CategoryDto[]>('/categories/admin', { token }),
  create: (input: CreateCategoryInput, token: string) =>
    apiRequest<CategoryDto>('/categories', { method: 'POST', body: input, token }),
  update: (id: string, input: UpdateCategoryInput, token: string) =>
    apiRequest<CategoryDto>(`/categories/${id}`, { method: 'PATCH', body: input, token }),
  uploadImage: (id: string, file: File, token: string) => {
    const form = new FormData();
    form.append('file', file);
    return uploadRequest<CategoryDto>(`/categories/${id}/image`, form, token);
  },
  removeImage: (id: string, token: string) =>
    apiRequest<CategoryDto>(`/categories/${id}/image`, { method: 'DELETE', token }),
};

export const adminApi = {
  dashboard: (query: AdminDashboardQuery, token: string) =>
    apiRequest<DashboardSummaryDto>(`/admin/dashboard${queryString(query)}`, { token }),
  ordersReportCsv: (query: AdminReportQuery, token: string) =>
    apiRequestText(`/admin/reports/orders${queryString(query)}`, { token }),
};

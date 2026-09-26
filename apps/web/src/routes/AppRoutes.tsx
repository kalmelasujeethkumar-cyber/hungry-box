import { Navigate, createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { PublicOnly, RequireAuth, RequireRole } from '../auth/route-guards';
import CustomerLayout from '../layouts/CustomerLayout';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import NotFoundPage from '../pages/NotFoundPage';
import AdminAuditPage from '../pages/admin/AdminAuditPage';
import AdminBranchesPage from '../pages/admin/AdminBranchesPage';
import AdminCataloguePage from '../pages/admin/AdminCataloguePage';
import AdminManagersPage from '../pages/admin/AdminManagersPage';
import AdminOrdersPage from '../pages/admin/AdminOrdersPage';
import AdminPartnersPage from '../pages/admin/AdminPartnersPage';
import AdminReportsPage from '../pages/admin/AdminReportsPage';
import AddressesPage from '../pages/customer/AddressesPage';
import CartPage from '../pages/customer/CartPage';
import CheckoutPage from '../pages/customer/CheckoutPage';
import OrderDetailPage from '../pages/customer/OrderDetailPage';
import OrderSuccessPage from '../pages/customer/OrderSuccessPage';
import OrderHistoryPage from '../pages/customer/OrderHistoryPage';
import { ProfilePage } from '../pages/customer/OrdersProfilePage';
import StorefrontPage from '../pages/customer/StorefrontPage';
import DeliveryHomePage from '../pages/delivery/DeliveryHomePage';
import DeliveryDeliveriesPage from '../pages/delivery/DeliveryDeliveriesPage';
import DeliveryLayout from '../pages/delivery/DeliveryLayout';
import DeliveryProfilePage from '../pages/delivery/DeliveryProfilePage';
import ManagerOrdersPage from '../pages/manager/ManagerOrdersPage';
import ManagerOrderDetailPage from '../pages/manager/ManagerOrderDetailPage';
import ManagerCatalogPage from '../pages/manager/ManagerCatalogPage';
import ManagerSettingsPage from '../pages/manager/ManagerSettingsPage';
import ManagerAuditPage from '../pages/manager/ManagerAuditPage';
import ManagerAssignmentsPage from '../pages/manager/ManagerAssignmentsPage';
import ManagerPartnerDetailPage from '../pages/manager/ManagerPartnerDetailPage';
import ManagerPartnersPage from '../pages/manager/ManagerPartnersPage';
import { LegacyManagerRedirect } from './legacy-manager-redirect';
import { ManagementDashboard, ManagementEntry } from './management-entry';
import {
  ADMIN_AUDIT_PATH,
  ADMIN_BRANCHES_PATH,
  ADMIN_CATALOGUE_PATH,
  ADMIN_MANAGERS_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_PARTNERS_PATH,
  ADMIN_REPORTS_PATH,
  BRANCH_ASSIGNMENTS_PATH,
  BRANCH_AUDIT_PATH,
  BRANCH_BASE_PATH,
  BRANCH_CATALOGUE_PATH,
  BRANCH_ORDERS_DETAIL_PATH,
  BRANCH_ORDERS_PATH,
  BRANCH_PARTNERS_DETAIL_PATH,
  BRANCH_PARTNERS_PATH,
  BRANCH_SETTINGS_PATH,
  HOME_PATH,
  LEGACY_MANAGER_BASE_PATH,
  LOGIN_PATH,
  MANAGEMENT_BASE_PATH,
  MANAGEMENT_DASHBOARD_PATH,
} from './paths';

/**
 * Exported separately from the router instance so tests can mount the real route
 * table (guards, redirects and all) on a memory router.
 */
export const appRouteConfig: RouteObject[] = [
  { path: HOME_PATH, element: <HomePage /> },
  {
    path: LOGIN_PATH,
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },

  // Single management entry: management login when unauthenticated, role-aware
  // dashboard when signed in, refusal for any non-management role.
  { path: MANAGEMENT_BASE_PATH, element: <ManagementEntry /> },
  { path: MANAGEMENT_DASHBOARD_PATH, element: <ManagementDashboard /> },

  // Super Admin management segments.
  {
    path: ADMIN_BRANCHES_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['SUPER_ADMIN']} loginPath={MANAGEMENT_BASE_PATH}>
          <AdminBranchesPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_ORDERS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['SUPER_ADMIN']} loginPath={MANAGEMENT_BASE_PATH}>
          <AdminOrdersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_CATALOGUE_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['SUPER_ADMIN']} loginPath={MANAGEMENT_BASE_PATH}>
          <AdminCataloguePage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_MANAGERS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['SUPER_ADMIN']} loginPath={MANAGEMENT_BASE_PATH}>
          <AdminManagersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_PARTNERS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['SUPER_ADMIN']} loginPath={MANAGEMENT_BASE_PATH}>
          <AdminPartnersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_AUDIT_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['SUPER_ADMIN']} loginPath={MANAGEMENT_BASE_PATH}>
          <AdminAuditPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_REPORTS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['SUPER_ADMIN']} loginPath={MANAGEMENT_BASE_PATH}>
          <AdminReportsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },

  // Branch Manager management segments.
  { path: BRANCH_BASE_PATH, element: <Navigate to={MANAGEMENT_DASHBOARD_PATH} replace /> },
  {
    path: BRANCH_ORDERS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerOrdersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: BRANCH_ORDERS_DETAIL_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerOrderDetailPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: BRANCH_CATALOGUE_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerCatalogPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: BRANCH_PARTNERS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerPartnersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: BRANCH_PARTNERS_DETAIL_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerPartnerDetailPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: BRANCH_ASSIGNMENTS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerAssignmentsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: BRANCH_SETTINGS_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerSettingsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: BRANCH_AUDIT_PATH,
    element: (
      <RequireAuth loginPath={MANAGEMENT_BASE_PATH}>
        <RequireRole roles={['BRANCH_MANAGER']} loginPath={MANAGEMENT_BASE_PATH}>
          <ManagerAuditPage />
        </RequireRole>
      </RequireAuth>
    ),
  },

  // Retired Branch Manager entry: redirect only, never a second login experience.
  { path: LEGACY_MANAGER_BASE_PATH, element: <LegacyManagerRedirect /> },
  { path: `${LEGACY_MANAGER_BASE_PATH}/*`, element: <LegacyManagerRedirect /> },

  {
    path: '/delivery',
    element: (
      <RequireAuth>
        <RequireRole roles={['DELIVERY_PARTNER']}>
          <DeliveryLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DeliveryHomePage /> },
      { path: 'deliveries', element: <DeliveryDeliveriesPage /> },
      { path: 'profile', element: <DeliveryProfilePage /> },
    ],
  },
  {
    path: '/customer',
    element: (
      <RequireAuth>
        <RequireRole roles={['CUSTOMER']}>
          <CustomerLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="storefront" replace /> },
      { path: 'storefront', element: <StorefrontPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'checkout/success/:orderId', element: <OrderSuccessPage /> },
      { path: 'addresses', element: <AddressesPage /> },
      { path: 'orders', element: <OrderHistoryPage /> },
      { path: 'orders/:orderId', element: <OrderDetailPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const appRouter = createBrowserRouter(appRouteConfig);

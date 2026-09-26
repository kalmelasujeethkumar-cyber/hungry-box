import { Navigate, createBrowserRouter } from 'react-router-dom';
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
import AdminOverviewPage from '../pages/admin/AdminOverviewPage';
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
import ManagerHomePage from '../pages/manager/ManagerHomePage';
import ManagerOrdersPage from '../pages/manager/ManagerOrdersPage';
import ManagerOrderDetailPage from '../pages/manager/ManagerOrderDetailPage';
import ManagerCatalogPage from '../pages/manager/ManagerCatalogPage';
import ManagerSettingsPage from '../pages/manager/ManagerSettingsPage';
import ManagerAuditPage from '../pages/manager/ManagerAuditPage';
import ManagerAssignmentsPage from '../pages/manager/ManagerAssignmentsPage';
import ManagerPartnerDetailPage from '../pages/manager/ManagerPartnerDetailPage';
import ManagerPartnersPage from '../pages/manager/ManagerPartnersPage';
import {
  ADMIN_AUDIT_PATH,
  ADMIN_BASE_PATH,
  ADMIN_BRANCHES_PATH,
  ADMIN_CATALOGUE_PATH,
  ADMIN_MANAGERS_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_PARTNERS_PATH,
  ADMIN_REPORTS_PATH,
  HOME_PATH,
  LOGIN_PATH,
  MANAGER_ASSIGNMENTS_PATH,
  MANAGER_AUDIT_PATH,
  MANAGER_BASE_PATH,
  MANAGER_CATALOG_PATH,
  MANAGER_ORDERS_PATH,
  MANAGER_PARTNERS_PATH,
  MANAGER_SETTINGS_PATH,
} from './paths';

export const appRouter = createBrowserRouter([
  { path: HOME_PATH, element: <HomePage /> },
  {
    path: LOGIN_PATH,
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
  {
    path: ADMIN_BASE_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminOverviewPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_BRANCHES_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminBranchesPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_ORDERS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminOrdersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_CATALOGUE_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminCataloguePage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_MANAGERS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminManagersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_PARTNERS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminPartnersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_AUDIT_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminAuditPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: ADMIN_REPORTS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminReportsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: MANAGER_BASE_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerHomePage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: MANAGER_PARTNERS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerPartnersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: '/manager/partners/:partnerId',
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerPartnerDetailPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: MANAGER_ASSIGNMENTS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerAssignmentsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: MANAGER_ORDERS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerOrdersPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: '/manager/orders/:orderId',
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerOrderDetailPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: MANAGER_CATALOG_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerCatalogPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: MANAGER_SETTINGS_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerSettingsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: MANAGER_AUDIT_PATH,
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerAuditPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
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
]);

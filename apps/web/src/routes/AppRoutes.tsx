import { Navigate, createBrowserRouter } from 'react-router-dom';
import { PublicOnly, RequireAuth, RequireRole } from '../auth/route-guards';
import CustomerLayout from '../layouts/CustomerLayout';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import NotFoundPage from '../pages/NotFoundPage';
import AdminHomePage from '../pages/admin/AdminHomePage';
import AddressesPage from '../pages/customer/AddressesPage';
import CartPage from '../pages/customer/CartPage';
import CheckoutPage from '../pages/customer/CheckoutPage';
import OrderDetailPage from '../pages/customer/OrderDetailPage';
import OrderSuccessPage from '../pages/customer/OrderSuccessPage';
import OrdersPage, { ProfilePage } from '../pages/customer/OrdersPage';
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
import { HOME_PATH, LOGIN_PATH } from './paths';

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
    path: '/admin',
    element: (
      <RequireAuth>
        <RequireRole roles={['SUPER_ADMIN']}>
          <AdminHomePage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: '/manager',
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerHomePage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: '/manager/partners',
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
    path: '/manager/assignments',
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerAssignmentsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: '/manager/orders',
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
    path: '/manager/catalog',
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerCatalogPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: '/manager/settings',
    element: (
      <RequireAuth>
        <RequireRole roles={['BRANCH_MANAGER']}>
          <ManagerSettingsPage />
        </RequireRole>
      </RequireAuth>
    ),
  },
  {
    path: '/manager/audit',
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
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/:orderId', element: <OrderDetailPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

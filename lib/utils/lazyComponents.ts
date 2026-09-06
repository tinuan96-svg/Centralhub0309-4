import { lazy } from 'react';

export const LazyOrdersPage = lazy(() => import('@/app/orders/page'));
export const LazyInventoryPage = lazy(() => import('@/app/inventory/page'));
export const LazyStoresPage = lazy(() => import('@/app/stores/page'));
export const LazyDashboardPage = lazy(() => import('@/app/dashboard/page'));
export const LazySuppliersPage = lazy(() => import('@/app/suppliers/page'));
export const LazyShippingPage = lazy(() => import('@/app/shipping/page'));

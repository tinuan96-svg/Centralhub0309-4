/**
 * Canonical staff permission IDs. Menu visibility is never an authorisation
 * boundary. The server and Supabase RLS must enforce the same permission.
 */
export const STAFF_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'stores', label: 'Stores & Company Data', actions: ['view', 'edit', 'manage'] },
  { key: 'orders', label: 'Orders', actions: ['view', 'create', 'edit', 'delete', 'export', 'refund'] },
  { key: 'customers', label: 'Customers', actions: ['view', 'edit', 'export'] },
  { key: 'support', label: 'Customer Care & Messaging', actions: ['view', 'reply', 'edit', 'delete', 'manage'] },
  { key: 'products', label: 'Products & Categories', actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { key: 'inventory', label: 'Stock & Inventory', actions: ['view', 'edit', 'adjust', 'audit', 'export'] },
  { key: 'procurement', label: 'Suppliers & Purchase Orders', actions: ['view', 'create', 'edit', 'approve', 'delete', 'export'] },
  { key: 'fulfilment', label: 'Picking, Packing & Dispatch', actions: ['view', 'pick', 'pack', 'dispatch'] },
  { key: 'shipping', label: 'Shipping & Tracking', actions: ['view', 'create', 'edit', 'export'] },
  { key: 'billing', label: 'Billing & Invoices', actions: ['view', 'create', 'edit', 'export'] },
  { key: 'finance', label: 'Accounts, Banking & VAT', actions: ['view', 'reconcile', 'edit', 'approve', 'export'] },
  { key: 'pricing', label: 'Pricing', actions: ['view', 'propose', 'approve', 'edit'] },
  { key: 'marketing', label: 'Marketing', actions: ['view', 'create', 'edit', 'approve', 'export'] },
  { key: 'analytics', label: 'Analytics & Reports', actions: ['view', 'export'] },
  { key: 'automation', label: 'NORA, Automation & Integrations', actions: ['view', 'execute', 'approve', 'manage'] },
  { key: 'settings', label: 'System Settings', actions: ['view', 'manage'] },
  { key: 'security', label: 'Security & Audit', actions: ['view', 'manage'] },
  { key: 'users', label: 'Staff & Permission Management', actions: ['view', 'manage'] },
] as const;
export type StaffRole = 'accountant' | 'customer_care_manager' | 'billing_staff'
  | 'store_manager' | 'warehouse_staff' | 'marketing_staff' | 'custom';
export const STAFF_ROLES: Array<{ key: StaffRole; label: string }> = [
  { key: 'accountant', label: 'Accountant' },
  { key: 'customer_care_manager', label: 'Customer Care Manager' },
  { key: 'billing_staff', label: 'Billing Staff' },
  { key: 'store_manager', label: 'Store Manager' },
  { key: 'warehouse_staff', label: 'Warehouse / Picking' },
  { key: 'marketing_staff', label: 'Marketing Staff' },
  { key: 'custom', label: 'Custom' },
];
export const PERMISSION_KEYS = STAFF_SECTIONS.flatMap(
  section => section.actions.map(action => `${section.key}.${action}`)
);
const catalog = new Set<string>(PERMISSION_KEYS);
export function isStaffPermission(value: unknown): value is string {
  return typeof value === 'string' && catalog.has(value);
}
export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && STAFF_ROLES.some(role => role.key === value);
}
/** Initial UI presets only; server grants and actual database policies are
 * deliberately default-deny until the entire backend access audit passes. */
export const STAFF_ROLE_PRESETS: Record<StaffRole, string[]> = {
  accountant: ['dashboard.view', 'finance.view', 'finance.reconcile', 'finance.export', 'billing.view', 'billing.export', 'analytics.view'],
  customer_care_manager: ['dashboard.view', 'orders.view', 'customers.view', 'support.view', 'support.reply', 'support.edit', 'shipping.view'],
  billing_staff: ['dashboard.view', 'billing.view', 'billing.create', 'billing.edit', 'orders.view', 'finance.view'],
  store_manager: ['dashboard.view', 'orders.view', 'orders.edit', 'products.view', 'inventory.view', 'inventory.edit', 'procurement.view', 'procurement.create', 'fulfilment.view', 'shipping.view'],
  warehouse_staff: ['dashboard.view', 'orders.view', 'inventory.view', 'fulfilment.view', 'fulfilment.pick', 'fulfilment.pack', 'shipping.view'],
  marketing_staff: ['dashboard.view', 'marketing.view', 'marketing.create', 'marketing.edit', 'products.view', 'analytics.view'],
  custom: [],
};

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  group: 'Sales' | 'Inventory' | 'Operations' | 'Finance' | 'Customers' | 'Intelligence';
}

/**
 * Curated shortcuts for the dashboard quick-action menu.
 * Keep these routes inside the existing application navigation so every
 * shortcut remains a normal, permission-aware page transition.
 */
export const QUICK_ACTION_CATALOG: QuickAction[] = [
  { id: 'orders', label: 'Orders', description: 'Open the order queue', href: '/orders', icon: '🛒', group: 'Sales' },
  { id: 'product-stock', label: 'Product & Stock', description: 'Check quantity, location and product details', href: '/inventory', icon: '📦', group: 'Inventory' },
  { id: 'todays-sales', label: "Today's Sales", description: 'Open sales and profit analysis', href: '/profit-analysis', icon: '💷', group: 'Sales' },
  { id: 'packing', label: 'Packing Queue', description: 'Orders waiting to be packed', href: '/packing', icon: '✅', group: 'Operations' },
  { id: 'shipping', label: 'Shipping', description: 'Shipments and delivery work', href: '/shipping', icon: '🚚', group: 'Operations' },
  { id: 'banking', label: 'Banking', description: 'Bank movements and reconciliation', href: '/banking', icon: '🏦', group: 'Finance' },
  { id: 'customer-support', label: 'Customer Support', description: 'Open the customer conversation inbox', href: '/customer-care/inbox', icon: '💬', group: 'Customers' },
  { id: 'procurement', label: 'Procurement', description: 'Purchase planning and supplier work', href: '/backorder-planning', icon: '🛍️', group: 'Operations' },
  { id: 'price-opportunities', label: 'Price Opportunities', description: 'Review pricing opportunities', href: '/business-intelligence/price-opportunities', icon: '📈', group: 'Intelligence' },
  { id: 'inventory-dashboard', label: 'Inventory Dashboard', description: 'Inventory health at a glance', href: '/inventory-management', icon: '📊', group: 'Inventory' },
  { id: 'customers', label: 'Customers', description: 'Customer records and activity', href: '/customers', icon: '👥', group: 'Customers' },
  { id: 'finance', label: 'Finance', description: 'Finance overview and controls', href: '/finance', icon: '💰', group: 'Finance' },
  { id: 'profit-analysis', label: 'Profit Analysis', description: 'Profit, margin and cost analysis', href: '/profit-analysis', icon: '📉', group: 'Finance' },
  { id: 'suppliers', label: 'Suppliers', description: 'Supplier records and pricing', href: '/suppliers', icon: '🏭', group: 'Operations' },
  { id: 'business-intelligence', label: 'Business Intelligence', description: 'Executive analytics and insights', href: '/business-intelligence/executive', icon: '🧠', group: 'Intelligence' },
  { id: 'auto-site-health', label: 'Auto Site Health', description: 'Monitor and control autonomous website repairs', href: '/site-health', icon: '🩺', group: 'Intelligence' },
];

export const DEFAULT_QUICK_ACTION_IDS = [
  'orders',
  'product-stock',
  'todays-sales',
  'packing',
  'shipping',
  'banking',
  'customer-support',
];

export const QUICK_ACTION_STORAGE_KEY = 'centralhub.dashboard.quick-actions.v1';
export const MAX_QUICK_ACTIONS = 8;

export function getQuickActions(ids: string[]): QuickAction[] {
  return ids
    .map(id => QUICK_ACTION_CATALOG.find(action => action.id === id))
    .filter((action): action is QuickAction => Boolean(action));
}

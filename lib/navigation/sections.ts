/** Shared navigation tree for the authenticated sidebar and the isolated public demo.
 * Data only. Never import auth, Supabase, or protected routes into the demo.
 */
export interface NavItem { href: string; label: string; badge?: number; }
export interface NavSection { key: string; label: string; icon: string; description: string; items: NavItem[]; }

export const sections: NavSection[] = [
  { key: '01-command', label: 'Command Centre', icon: '🏠', description: 'Daily business overview and actions', items: [{ href: '/dashboard', label: 'Dashboard' }] },
  { key: '02-network-sales', label: 'Network & Sales', icon: '🛒', description: 'Stores, orders and customer relationships', items: [
    { href: '/stores', label: 'All Stores' }, { href: '/inventory/visibility', label: 'Store Visibility' }, { href: '/settings/master-data/stores', label: 'Store Settings' },
    { href: '/orders', label: 'Order Queue' }, { href: '/sync-status', label: 'Order Monitor' }, { href: '/customers', label: 'Customers' },
  ] },
  { key: '03-catalog-inventory', label: 'Catalog & Inventory', icon: '📦', description: 'Products, stock and inventory control', items: [
    { href: '/inventory', label: 'Product Manager' }, { href: '/inventory/intelligence', label: 'Product Intelligence' }, { href: '/inventory/categories', label: 'Categories & Sales' }, { href: '/inventory/brands', label: 'Brands & Sales' }, { href: '/inventory/bulk', label: 'Bulk Product Manager' }, { href: '/business-intelligence/executive#approvals', label: 'Product Approvals' },
    { href: '/inventory-management/sync', label: 'Store Product Sync' },
    { href: '/inventory-management', label: 'Inventory Dashboard' }, { href: '/inventory-management/stock', label: 'Stock List' }, { href: '/inventory-management/adjustments', label: 'Stock Adjustments' },
    { href: '/inventory-management/movements', label: 'Stock Movements' }, { href: '/inventory-audit', label: 'Stock Audit' }, { href: '/inventory-management/reports', label: 'Inventory Reports' },
    { href: '/inventory-management/warehouses', label: 'Warehouses & Bins' }, { href: '/inventory-management/barcode', label: 'Barcode Scanner' }, { href: '/inventory-management/packaging', label: 'Packaging' }, { href: '/inventory-management/expiry', label: 'Expiry Management' },
  ] },
  { key: '04-procurement', label: 'Procurement', icon: '🛍️', description: 'Suppliers, purchasing and goods received', items: [
    { href: '/procurement', label: 'Procurement Dashboard' }, { href: '/backorder-planning', label: 'Purchase Planning' }, { href: '/inventory-management/purchase-orders', label: 'Purchase Orders' },
    { href: '/suppliers/invoices', label: 'Supplier Invoices' }, { href: '/inventory-management/grn', label: 'Goods Received (GRN)' }, { href: '/suppliers', label: 'Suppliers' },
    { href: '/suppliers/pricing', label: 'Supplier Pricing' }, { href: '/suppliers/comparison', label: 'Supplier Comparison' },
  ] },
  { key: '05-fulfilment', label: 'Fulfilment & Shipping', icon: '🚚', description: 'Prepare, dispatch and track orders', items: [
    { href: '/picking', label: 'Picking' }, { href: '/packing', label: 'Packing' }, { href: '/shipping', label: 'Shipment List' }, { href: '/shipping/tracking', label: 'Tracking' }, { href: '/shipping/calculator', label: 'Shipping Cost Calculator' },
  ] },
  { key: '06-customer-growth', label: 'Customer & Support', icon: '💬', description: 'Customers, support conversations and service operations', items: [
    { href: '/customer-care/inbox', label: 'Support Inbox' }, { href: '/customer-care/email', label: 'Email Inbox' }, { href: '/customer-care/conversations', label: 'Conversations' }, { href: '/customer-care/tickets', label: 'Tickets' },
    { href: '/customer-care/channels', label: 'WhatsApp Channels' }, { href: '/customer-care/ai-assistant', label: 'AI Assistant' }, { href: '/customer-care/knowledge-base', label: 'Knowledge Base' }, { href: '/customer-care/templates', label: 'Templates' }, { href: '/customer-care/automations', label: 'Automations' },
  ] },
  { key: '10-marketing', label: 'Marketing', icon: '📣', description: 'Campaigns, promotions, audiences and customer growth', items: [
    { href: '/marketing', label: 'Marketing Overview' }, { href: '/marketing/campaigns', label: 'Campaigns' }, { href: '/marketing/promotions', label: 'Promotions' }, { href: '/marketing/segments', label: 'Segments' }, { href: '/marketing/calendar', label: 'Marketing Calendar' },
    { href: '/marketing/whatsapp', label: 'WhatsApp Marketing' }, { href: '/marketing/email', label: 'Email Marketing' }, { href: '/marketing/social', label: 'Social Media' }, { href: '/marketing/product-feeds', label: 'Product Feeds' }, { href: '/marketing/tracking', label: 'Tracking' }, { href: '/marketing/audiences', label: 'Audiences' },
    { href: '/marketing/creative-library', label: 'Creative Library' }, { href: '/marketing/budgets', label: 'Marketing Budgets' }, { href: '/marketing/apps', label: 'App Marketing & Stores' }, { href: '/marketing/apps/releases', label: 'App Releases' }, { href: '/marketing/customer-journey', label: 'Customer Journey' }, { href: '/marketing/alerts', label: 'Marketing Alerts' }, { href: '/marketing/ai', label: 'AI Marketing & SEO' }, { href: '/marketing/integrations', label: 'Marketing Integrations' }, { href: '/marketing/settings', label: 'Marketing Settings' },
  ] },
  { key: '07-analytics', label: 'Analytics', icon: '📈', description: 'Website, GA4, realtime visitors, search, attribution and app analytics', items: [
    { href: '/analytics', label: 'Analytics Overview' }, { href: '/analytics#growth', label: 'Growth & Trends' }, { href: '/analytics#website-ga4', label: 'Website & GA4' },
    { href: '/analytics#realtime', label: 'Realtime Visitors' }, { href: '/analytics#visitors', label: 'Visitor Tracking' }, { href: '/analytics#traffic-attribution', label: 'Traffic & Attribution' },
    { href: '/analytics#geography', label: 'Geography & Devices' }, { href: '/analytics#ecommerce', label: 'Ecommerce Analytics' }, { href: '/analytics#search-console', label: 'Google Search Console' },
    { href: '/analytics#apps', label: 'Play & App Store Analytics' }, { href: '/analytics#health', label: 'Analytics Data Health' },
  ] },
  { key: '07-intelligence', label: 'Intelligence & Decisions', icon: '🧠', description: 'Analysis, competitors and commercial decisions', items: [
    { href: '/business-intelligence/executive', label: 'Executive BI' }, { href: '/business-intelligence/price-opportunities', label: 'Price Opportunities' }, { href: '/business-intelligence/inventory', label: 'Inventory BI' }, { href: '/business-intelligence/revenue-margin', label: 'Revenue & Margin' }, { href: '/business-intelligence/customers', label: 'Customer BI' }, { href: '/marketing/intelligence', label: 'Marketing BI' }, { href: '/business-intelligence/ai-usage', label: 'AI Usage' }, { href: '/business-intelligence/automation', label: 'Automation BI' }, { href: '/business-intelligence/promotion-simulator', label: 'Promotion Simulator' },
    { href: '/competitors', label: 'Competitor Intelligence' },
  ] },
  { key: '07-pricing', label: 'Pricing', icon: '🏷️', description: 'Profit targets, price fixing, market signals and approval-controlled price decisions', items: [
    { href: '/pricing', label: 'Pricing Overview' }, { href: '/pricing/approval', label: 'Pricing Approval Centre' }, { href: '/pricing?tab=fixing', label: 'Price Fixing' },
    { href: '/pricing?tab=weekly', label: 'Weekly Pricing Strategy' }, { href: '/pricing?tab=competitors', label: 'Competitive Pricing' },
    { href: '/pricing?tab=rules', label: 'Pricing Rules' }, { href: '/pricing?tab=history', label: 'Price History' },
  ] },
  { key: '08-finance', label: 'Finance & Control', icon: '💰', description: 'Bank, expenses, ledgers, payables, P&L and profitability', items: [
    { href: '/finance', label: 'Finance Overview' }, { href: '/finance/planning', label: 'Planning & Growth' }, { href: '/profit-analysis', label: 'Profit Analysis' }, { href: '/banking', label: 'Bank Accounts & Cashflow' }, { href: '/finance/ledger', label: 'Chart of Accounts & Ledger' }, { href: '/finance/transactions', label: 'Bank Reconciliation' }, { href: '/finance/mollie', label: 'Mollie Audit' }, { href: '/finance/payables', label: 'Supplier Payables' }, { href: '/expenses', label: 'Business Expenses' }, { href: '/finance/p-and-l', label: 'Profit & Loss' }, { href: '/finance/profitability', label: 'Profitability' }, { href: '/finance/alerts', label: 'Financial Alerts' }, { href: '/finance/vat', label: 'VAT Control' },
  ] },
  { key: '08.5-developer', label: 'Developer & CI/CD', icon: '🛠️', description: 'Builds, artifacts, releases and deployment automation', items: [
    { href: '/developer/ci-cd', label: 'Builds & CI/CD' }, { href: '/developer/ci-cd/releases', label: 'App Releases' },
  ] },
  { key: '09-system', label: 'Administration & System', icon: '⚙️', description: 'Users, configuration and audit controls', items: [
    { href: '/settings', label: 'System Settings' }, { href: '/settings/notifications', label: 'Notifications & Phone Alerts' }, { href: '/site-health', label: 'Site Health' }, { href: '/settings/users', label: 'User Management' }, { href: '/inventory-management/reports/audit', label: 'Audit Logs' },
  ] },
];


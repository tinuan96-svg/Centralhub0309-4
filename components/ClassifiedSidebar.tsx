'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { designTokens } from '@/lib/design-system';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

interface NavItem { href: string; label: string; badge?: number; }
interface NavSection { key: string; label: string; icon: string; description: string; items: NavItem[]; }

const sections: NavSection[] = [
  { key: '01-command', label: 'Command Centre', icon: '🏠', description: 'Daily business overview and actions', items: [{ href: '/dashboard', label: 'Dashboard' }] },
  { key: '02-network-sales', label: 'Network & Sales', icon: '🛒', description: 'Stores, orders and customer relationships', items: [
    { href: '/stores', label: 'All Stores' }, { href: '/inventory/visibility', label: 'Store Visibility' }, { href: '/settings/master-data/stores', label: 'Store Settings' },
    { href: '/orders', label: 'Order Queue' }, { href: '/sync-status', label: 'Order Monitor' }, { href: '/customers', label: 'Customers' },
  ] },
  { key: '03-catalog-inventory', label: 'Catalog & Inventory', icon: '📦', description: 'Products, stock and inventory control', items: [
    { href: '/inventory', label: 'Product Manager' }, { href: '/inventory/bulk', label: 'Bulk Product Manager' }, { href: '/business-intelligence/executive#approvals', label: 'Product Approvals' },
    { href: '/settings/master-data/categories', label: 'Categories' }, { href: '/settings/master-data/brands', label: 'Brands' }, { href: '/inventory-management/sync', label: 'Store Product Sync' },
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
    { href: '/customer-care/inbox', label: 'Support Inbox' }, { href: '/customer-care/conversations', label: 'Conversations' }, { href: '/customer-care/tickets', label: 'Tickets' },
    { href: '/customer-care/channels', label: 'WhatsApp Channels' }, { href: '/customer-care/ai-assistant', label: 'AI Assistant' }, { href: '/customer-care/knowledge-base', label: 'Knowledge Base' }, { href: '/customer-care/templates', label: 'Templates' }, { href: '/customer-care/automations', label: 'Automations' },
  ] },
  { key: '10-marketing', label: 'Marketing', icon: '📣', description: 'Campaigns, promotions, audiences and customer growth', items: [
    { href: '/marketing', label: 'Marketing Overview' }, { href: '/marketing/campaigns', label: 'Campaigns' }, { href: '/marketing/promotions', label: 'Promotions' }, { href: '/marketing/segments', label: 'Segments' }, { href: '/marketing/calendar', label: 'Marketing Calendar' },
    { href: '/marketing/whatsapp', label: 'WhatsApp Marketing' }, { href: '/marketing/email', label: 'Email Marketing' }, { href: '/marketing/social', label: 'Social Media' }, { href: '/marketing/product-feeds', label: 'Product Feeds' }, { href: '/marketing/tracking', label: 'Tracking' }, { href: '/marketing/audiences', label: 'Audiences' },
    { href: '/marketing/creative-library', label: 'Creative Library' }, { href: '/marketing/budgets', label: 'Marketing Budgets' }, { href: '/marketing/apps', label: 'App Marketing & Stores' }, { href: '/marketing/apps/releases', label: 'App Releases' }, { href: '/marketing/customer-journey', label: 'Customer Journey' }, { href: '/marketing/alerts', label: 'Marketing Alerts' }, { href: '/marketing/ai', label: 'AI Marketing & SEO' }, { href: '/marketing/integrations', label: 'Marketing Integrations' }, { href: '/marketing/settings', label: 'Marketing Settings' },
  ] },
  { key: '07-analytics', label: 'Analytics', icon: '📈', description: 'Website, GA4, realtime visitors, search, attribution and app analytics', items: [
    { href: '/analytics', label: 'Analytics Overview' },
    { href: '/analytics#growth', label: 'Growth & Trends' },
    { href: '/analytics#website-ga4', label: 'Website & GA4' },
    { href: '/analytics#realtime', label: 'Realtime Visitors' },
    { href: '/analytics#visitors', label: 'Visitor Tracking' },
    { href: '/analytics#traffic-attribution', label: 'Traffic & Attribution' },
    { href: '/analytics#geography', label: 'Geography & Devices' },
    { href: '/analytics#ecommerce', label: 'Ecommerce Analytics' },
    { href: '/analytics#search-console', label: 'Google Search Console' },
    { href: '/analytics#apps', label: 'Play & App Store Analytics' },
    { href: '/analytics#health', label: 'Analytics Data Health' },
  ] },
  { key: '07-intelligence', label: 'Intelligence & Decisions', icon: '🧠', description: 'Analysis, competitors and commercial decisions', items: [
    { href: '/business-intelligence/executive', label: 'Executive BI' }, { href: '/business-intelligence/price-opportunities', label: 'Price Opportunities' }, { href: '/business-intelligence/inventory', label: 'Inventory BI' }, { href: '/business-intelligence/revenue-margin', label: 'Revenue & Margin' }, { href: '/business-intelligence/customers', label: 'Customer BI' }, { href: '/marketing/intelligence', label: 'Marketing BI' }, { href: '/business-intelligence/ai-usage', label: 'AI Usage' }, { href: '/business-intelligence/automation', label: 'Automation BI' }, { href: '/business-intelligence/promotion-simulator', label: 'Promotion Simulator' },
    { href: '/competitors', label: 'Competitor Intelligence' },
    { href: '/pricing', label: 'Pricing Overview' }, { href: '/pricing/approval', label: 'Pricing Approval Centre' }, { href: '/pricing?tab=fixing', label: 'Price Fixing' }, { href: '/pricing?tab=weekly', label: 'Weekly Pricing Strategy' }, { href: '/pricing?tab=competitors', label: 'Competitive Pricing' }, { href: '/pricing?tab=rules', label: 'Pricing Rules' }, { href: '/pricing?tab=history', label: 'Price History' },
  ] },
  { key: '08-finance', label: 'Finance & Control', icon: '💰', description: 'Bank, expenses, ledgers, payables, P&L and profitability', items: [
    { href: '/finance', label: 'Finance Overview' }, { href: '/finance/planning', label: 'Planning & Growth' }, { href: '/profit-analysis', label: 'Profit Analysis' }, { href: '/banking', label: 'Bank Accounts & Cashflow' }, { href: '/finance/ledger', label: 'Chart of Accounts & Ledger' }, { href: '/finance/transactions', label: 'Bank Reconciliation' }, { href: '/finance/mollie', label: 'Mollie Audit' }, { href: '/finance/payables', label: 'Supplier Payables' }, { href: '/expenses', label: 'Business Expenses' }, { href: '/finance/p-and-l', label: 'Profit & Loss' }, { href: '/finance/profitability', label: 'Profitability' }, { href: '/finance/alerts', label: 'Financial Alerts' }, { href: '/finance/vat', label: 'VAT Control' },
  ] },
  { key: '09-system', label: 'Administration & System', icon: '⚙️', description: 'Users, configuration and audit controls', items: [
    { href: '/settings', label: 'System Settings' }, { href: '/settings/notifications', label: 'Notifications & Phone Alerts' }, { href: '/site-health', label: 'Site Health' }, { href: '/settings/users', label: 'User Management' }, { href: '/inventory-management/reports/audit', label: 'Audit Logs' },
  ] },
];

export default function ClassifiedSidebar({ collapsed: manualCollapsed = false, onToggleCollapse }: { collapsed?: boolean; onToggleCollapse?: () => void }) {
  const pathname = usePathname();
  const { isAdmin, disabledNavKeys, user, signOut } = useAuth();
  const [navSearch, setNavSearch] = useState('');
  const [expanded, setExpanded] = useState<string[]>(['01-command']);
  const [mounted, setMounted] = useState(false);
  const [width, setWidth] = useState(1200);
  const [sidebarPreference, setSidebarPreference] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ pendingOrders: 0, lowStock: 0, backorders: 0, tickets: 0 });

  const fetchStats = useCallback(async () => {
    const [orders, stock, backorders, tickets] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'pending_payment'),
      supabase.from('central_inventory').select('product_id', { count: 'exact', head: true }).lte('stock_quantity', 5).gt('stock_quantity', 0),
      supabase.from('central_inventory').select('product_id', { count: 'exact', head: true }).lt('stock_quantity', 0),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);
    setStats({ pendingOrders: orders.count || 0, lowStock: stock.count || 0, backorders: backorders.count || 0, tickets: tickets.count || 0 });
  }, []);

  useEffect(() => {
    setMounted(true);
    setWidth(window.innerWidth);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    const savedCollapse = localStorage.getItem('sidebar_classified_collapsed_v2');
    if (savedCollapse === 'true' || savedCollapse === 'false') {
      setSidebarPreference(savedCollapse === 'true');
    }
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => { fetchStats(); const id = setInterval(fetchStats, 300000); return () => clearInterval(id); }, [fetchStats]);
  useEffect(() => { const saved = localStorage.getItem('sidebar_classified_sections'); if (saved) { try { setExpanded(JSON.parse(saved)); } catch {} } }, []);
  useEffect(() => { if (mounted) localStorage.setItem('sidebar_classified_sections', JSON.stringify(expanded)); }, [expanded, mounted]);
  useEffect(() => { const current = sections.find(s => s.items.some(i => { const base = i.href.split(/[?#]/)[0]; return pathname === base || pathname.startsWith(base + '/'); })); if (current && !expanded.includes(current.key)) setExpanded(v => [...v, current.key]); }, [pathname, expanded]);

  const counts: Record<string, number> = { '02-network-sales': stats.pendingOrders, '03-catalog-inventory': stats.lowStock, '04-procurement': stats.backorders, '06-customer-growth': stats.tickets };
  const filtered = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    const allowed = isAdmin ? sections : sections.filter(s => !disabledNavKeys.includes(s.key));
    if (!q) return allowed;
    return allowed.map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(q) || i.href.toLowerCase().includes(q)) })).filter(s => s.label.toLowerCase().includes(q) || s.items.length);
  }, [navSearch, isAdmin, disabledNavKeys]);

  const autoCollapsed = width < 1200;
  const collapsed = manualCollapsed || (sidebarPreference ?? autoCollapsed);
  const setCollapsed = (next: boolean) => {
    if (manualCollapsed) {
      onToggleCollapse?.();
      return;
    }
    setSidebarPreference(next);
    localStorage.setItem('sidebar_classified_collapsed_v2', String(next));
  };
  const toggle = (key: string) => setExpanded(v => v.includes(key) ? v.filter(x => x !== key) : [...v, key]);
  const active = (href: string) => { const base = href.split(/[?#]/)[0]; return pathname === base || pathname.startsWith(base + '/'); };

  return (
    <aside data-collapsed={collapsed ? 'true' : 'false'} className={`centralhub-sidebar ${collapsed ? designTokens.layout.sidebarWidthCollapsed : designTokens.layout.sidebarWidth} ${designTokens.colors.background.main} border-r ${designTokens.colors.border.default} h-screen sticky top-0 flex flex-col transition-all duration-300 ease-in-out z-50`}>
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
        {collapsed ? (
          <Link href="/dashboard" aria-label="CentralHub dashboard" className="font-black text-white text-sm">CH</Link>
        ) : (
          <Link href="/dashboard" className="font-black text-white">CentralHub</Link>
        )}
        <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="min-w-9 min-h-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 touch-manipulation">{collapsed ? '→' : '←'}</button>
      </div>
      {!collapsed && <div className="px-4 pt-3"><div className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-400">Business navigation</div><div className="text-[10px] text-slate-600 mt-1">Organised by what each area is used for</div></div>}
      <div className="p-3">{collapsed ? <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar search" title="Expand sidebar search" className="w-full min-h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-lg touch-manipulation">⌕</button> : <input value={navSearch} onChange={e => setNavSearch(e.target.value)} placeholder="Search navigation..." className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" />}</div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {mounted && filtered.map(section => <div key={section.key} className="mb-1">
          <button type="button" onClick={() => { if (collapsed) { setCollapsed(false); setExpanded(v => v.includes(section.key) ? v : [...v, section.key]); } else { toggle(section.key); } }} title={collapsed ? `${section.label}: ${section.description}` : section.description} aria-expanded={expanded.includes(section.key)} className={`w-full min-h-[44px] touch-manipulation flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest ${pathname && section.items.some(i => active(i.href)) ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>
            <span className={collapsed ? 'w-full text-center text-xl' : 'truncate'}>{collapsed ? section.icon : <>{section.icon} {section.label}{counts[section.key] ? <span className="ml-2 text-[9px] text-amber-300">{counts[section.key]}</span> : null}</>}</span>
            {!collapsed && <span>{expanded.includes(section.key) ? '−' : '+'}</span>}
          </button>
          {expanded.includes(section.key) && !collapsed && <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">{section.items.map(item => <Link key={item.href} href={item.href} className={`block px-3 py-2 rounded-lg text-xs ${active(item.href) ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-200'}`}>{item.label}{item.badge ? ` (${item.badge})` : ''}</Link>)}</div>}
        </div>)}
      </nav>
      <div className="p-3 border-t border-slate-800 flex items-center justify-between"><div className="min-w-0"><div className="text-xs font-bold text-white truncate">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}</div>{!collapsed && <div className="text-[10px] text-slate-600 truncate">{user?.email || ''}</div>}</div><button onClick={signOut} className="text-xs text-slate-500 hover:text-rose-300" title="Sign out">↪</button></div>
    </aside>
  );
}

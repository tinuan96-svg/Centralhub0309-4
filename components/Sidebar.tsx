'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { designTokens } from '@/lib/design-system';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

interface SidebarProps { collapsed?: boolean; onToggleCollapse?: () => void; }

export default function Sidebar({ collapsed: manualCollapsed = false, onToggleCollapse }: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { isAdmin, disabledNavKeys, user, signOut } = useAuth();
  const [navSearch, setNavSearch] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [stats, setStats] = useState({ pendingOrders: 0, lowStock: 0, backorders: 0, tickets: 0 });
  const fetchSidebarStats = useCallback(async () => {
    try {
      const [ordersRes, lowStockRes, backorderRes, ticketsRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'pending_payment'),
        supabase.from('central_inventory').select('product_id', { count: 'exact', head: true }).lte('stock_quantity', 5).gt('stock_quantity', 0),
        supabase.from('central_inventory').select('product_id', { count: 'exact', head: true }).lt('stock_quantity', 0),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      ]);
      setStats({ pendingOrders: ordersRes.count || 0, lowStock: lowStockRes.count || 0, backorders: backorderRes.count || 0, tickets: ticketsRes.count || 0 });
    } catch (err) { console.error('Sidebar: Error fetching stats:', err); }
  }, []);
  useEffect(() => { fetchSidebarStats(); const interval = setInterval(fetchSidebarStats, 5 * 60 * 1000); return () => clearInterval(interval); }, [fetchSidebarStats]);
  const [windowWidth, setTotalWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => { setMounted(true); const handleResize = () => setTotalWidth(window.innerWidth); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
  const isAutoCollapsed = windowWidth < 1100;
  const collapsed = manualCollapsed || (isAutoCollapsed && !isHovered);
  const [expandedSections, setExpandedSections] = useState<string[]>(() => {
    if (typeof window !== 'undefined') { const saved = localStorage.getItem('sidebar_expanded_sections'); return saved ? JSON.parse(saved) : ['01 — home']; }
    return ['01 — home'];
  });
  useEffect(() => { localStorage.setItem('sidebar_expanded_sections', JSON.stringify(expandedSections)); }, [expandedSections]);
  useEffect(() => {
    const sections = [
      { key: '02 — stores', paths: ['/stores', '/inventory/visibility', '/settings/master-data/stores'] },
      { key: '03 — sales & orders', paths: ['/orders', '/sync-status', '/customers'] },
      { key: '04 — products', paths: ['/inventory', '/inventory/bulk', '/settings/master-data/categories', '/settings/master-data/brands', '/inventory-management/sync'] },
      { key: '05 — inventory', paths: ['/inventory-management', '/inventory-management/stock', '/inventory-management/adjustments', '/inventory-management/movements', '/inventory-audit', '/inventory-management/reports', '/inventory-management/warehouses', '/inventory-management/barcode', '/inventory-management/packaging', '/inventory-management/expiry'] },
      { key: '06 — procurement', paths: ['/backorder-planning', '/inventory-management/purchase-orders', '/suppliers/invoices', '/inventory-management/grn', '/suppliers', '/suppliers/pricing', '/suppliers/comparison'] },
      { key: '07 — fulfilment', paths: ['/picking', '/packing'] }, { key: '08 — shipping', paths: ['/shipping', '/shipping/tracking', '/shipping/calculator'] },
      { key: '09 — customers & support', paths: ['/customers', '/customer-care'] }, { key: '10 — marketing', paths: ['/marketing'] },
      { key: '11 — business intelligence', paths: ['/business-intelligence', '/marketing/intelligence'] }, { key: '11.5 — competitors', paths: ['/competitors'] },
      { key: '12 — finance', paths: ['/finance', '/profit-analysis', '/banking', '/expenses'] }, { key: '13 — pricing', paths: ['/pricing'] }, { key: '14 — settings', paths: ['/settings'] },
    ];
    const currentSection = sections.find(s => s.paths.some(p => pathname.startsWith(p)));
    if (currentSection && !expandedSections.includes(currentSection.key)) setExpandedSections(prev => [...prev, currentSection.key]);
  }, [pathname]);

  const allNavItems = useMemo(() => [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠', key: '01 — home' },
    { label: 'Stores', icon: '🏪', key: '02 — stores', subItems: [{ href: '/stores', label: 'All Stores' }, { href: '/inventory/visibility', label: 'Store Visibility' }, { href: '/settings/master-data/stores', label: 'Store Settings' }] },
    { label: 'Sales & Orders', icon: '🛒', key: '03 — sales & orders', badge: stats.pendingOrders, subItems: [{ href: '/orders', label: 'Order Queue', badge: stats.pendingOrders }, { href: '/customers', label: 'Customers' }, { href: '/sync-status', label: 'Order Monitor' }] },
    { label: 'Products', icon: '📦', key: '04 — products', subItems: [{ href: '/inventory', label: 'Product Manager' }, { href: '/inventory/bulk', label: 'Bulk Manager' }, { href: '/business-intelligence/executive#approvals', label: 'Product Approvals' }, { href: '/settings/master-data/categories', label: 'Categories' }, { href: '/settings/master-data/brands', label: 'Brands' }, { href: '/marketing/ai', label: 'SEO & Content' }, { href: '/inventory-management/sync', label: 'Product Sync' }] },
    { label: 'Inventory', icon: '📊', key: '05 — inventory', badge: stats.lowStock, subItems: [{ href: '/inventory-management', label: 'Dashboard' }, { href: '/inventory-management/stock', label: 'Stock List', badge: stats.lowStock }, { href: '/inventory-management/adjustments', label: 'Adjustments' }, { href: '/inventory-management/movements', label: 'Movements' }, { href: '/inventory-audit', label: 'Stock Audit' }, { href: '/inventory-management/reports', label: 'Reports' }, { href: '/inventory-management/warehouses', label: 'Warehouse & Bins' }, { href: '/inventory-management/barcode', label: 'Barcode Scanner' }, { href: '/inventory-management/packaging', label: 'Packaging' }, { href: '/inventory-management/expiry', label: 'Expiry Management' }] },
    { label: 'Procurement', icon: '🛍️', key: '06 — procurement', badge: stats.backorders, subItems: [{ href: '/procurement', label: 'Dashboard', badge: stats.backorders }, { href: '/backorder-planning', label: 'Planning Engine' }, { href: '/inventory-management/purchase-orders', label: 'Purchase Orders' }, { href: '/suppliers/invoices', label: 'Supplier Invoices' }, { href: '/inventory-management/grn', label: 'Goods Received (GRN)' }, { href: '/suppliers', label: 'All Suppliers' }, { href: '/suppliers/pricing', label: 'Supplier Pricing' }, { href: '/suppliers/comparison', label: 'Price Comparison' }] },
    { label: 'Fulfilment', icon: '🚚', key: '07 — fulfilment', subItems: [{ href: '/picking', label: 'Picking' }, { href: '/packing', label: 'Packing' }] },
    { label: 'Shipping', icon: '🚛', key: '08 — shipping', subItems: [{ href: '/shipping', label: 'Shipment List' }, { href: '/shipping/tracking', label: 'Tracking' }, { href: '/shipping/calculator', label: 'Cost Calculator' }] },
    { label: 'Customers & Support', icon: '💬', key: '09 — customers & support', badge: stats.tickets, subItems: [{ href: '/customers', label: 'Customers' }, { href: '/customer-care/inbox', label: 'Support Inbox', badge: stats.tickets }, { href: '/customer-care/conversations', label: 'Conversations' }, { href: '/customer-care/tickets', label: 'Tickets' }, { href: '/customer-care/channels', label: 'WhatsApp Channels' }, { href: '/customer-care/ai-assistant', label: 'AI Assistant' }, { href: '/customer-care/knowledge-base', label: 'Knowledge Base' }, { href: '/customer-care/templates', label: 'Templates' }, { href: '/customer-care/automations', label: 'Automations' }] },
    { label: 'Marketing', icon: '📣', key: '10 — marketing', subItems: [{ href: '/marketing', label: 'Overview' }, { href: '/marketing/campaigns', label: 'Campaigns' }, { href: '/marketing/promotions', label: 'Promotions' }, { href: '/marketing/segments', label: 'Segments' }, { href: '/marketing/calendar', label: 'Calendar' }, { href: '/marketing/whatsapp', label: 'WhatsApp' }, { href: '/marketing/email', label: 'Email' }, { href: '/marketing/social', label: 'Social Media' }, { href: '/marketing/product-feeds', label: 'Product Feeds' }, { href: '/marketing/tracking', label: 'Tracking' }, { href: '/marketing/audiences', label: 'Audiences' }, { href: '/marketing/creative-library', label: 'Creative Library' }, { href: '/marketing/budgets', label: 'Budgets' }, { href: '/marketing/analytics', label: 'Analytics' }, { href: '/marketing/customer-journey', label: 'Customer Journey' }, { href: '/marketing/alerts', label: 'Alerts' }, { href: '/marketing/ai', label: 'AI Marketing' }, { href: '/marketing/integrations', label: 'Integrations' }, { href: '/marketing/settings', label: 'Settings' }] },
    { label: 'Business Intelligence', icon: '🧠', key: '11 — business intelligence', subItems: [{ href: '/business-intelligence/executive', label: 'Executive BI' }, { href: '/business-intelligence/price-opportunities', label: 'Price Opportunities' }, { href: '/business-intelligence/promotion-simulator', label: 'Promotion Simulator' }, { href: '/business-intelligence/inventory', label: 'Inventory BI' }, { href: '/business-intelligence/revenue-margin', label: 'Revenue & Margin' }, { href: '/business-intelligence/customers', label: 'Customer BI' }, { href: '/marketing/intelligence', label: 'Marketing BI' }, { href: '/business-intelligence/ai-usage', label: 'AI Usage' }, { href: '/business-intelligence/automation', label: 'Automation BI' }] },
    { label: 'Competitors', icon: '🎯', key: '11.5 — competitors', subItems: [{ href: '/competitors', label: 'Competitor Intelligence' }, { href: '/business-intelligence/price-opportunities', label: 'Price Opportunities' }] },
    { label: 'Finance', icon: '💰', key: '12 — finance', subItems: [
      { href: '/finance', label: 'Finance Overview' },
      { href: '/banking', label: 'Bank Accounts & Cashflow' },
      { href: '/finance/transactions', label: 'Bank Transactions' },
      { href: '/finance/payables', label: 'Supplier Payables' },
      { href: '/expenses', label: 'Business Expenses' },
      { href: '/finance/p-and-l', label: 'Profit & Loss' },
      { href: '/finance/profitability', label: 'Profitability' },
      { href: '/finance/alerts', label: 'Financial Alerts' },
    ] },
    { label: 'Pricing', icon: '🏷️', key: '13 — pricing', subItems: [{ href: '/pricing', label: 'Overview' }, { href: '/pricing/approval', label: 'Approval Centre' }, { href: '/pricing?tab=fixing', label: 'Price Fixing' }, { href: '/pricing?tab=weekly', label: 'Weekly Strategy' }, { href: '/pricing?tab=competitors', label: 'Competitors' }, { href: '/pricing?tab=rules', label: 'Pricing Rules' }, { href: '/pricing?tab=history', label: 'Price History' }] },
    { label: 'Settings', icon: '⚙️', key: '14 — settings', subItems: [{ href: '/settings', label: 'System Overview' }, { href: '/settings/users', label: 'User Management' }, { href: '/inventory-management/reports/audit', label: 'Audit Logs' }] },
  ], [stats]);

  const navItems = useMemo(() => {
    if (!mounted) return [];
    let items = isAdmin ? allNavItems : allNavItems.filter(item => !disabledNavKeys.includes(item.key));
    if (navSearch.trim()) {
      const q = navSearch.toLowerCase();
      items = items.map(item => {
        if (item.label.toLowerCase().includes(q)) return item;
        if (item.subItems) { const filteredSubs = item.subItems.filter(s => s.label.toLowerCase().includes(q)); if (filteredSubs.length) return { ...item, subItems: filteredSubs }; }
        return null;
      }).filter(Boolean) as any;
    }
    return items;
  }, [mounted, isAdmin, allNavItems, disabledNavKeys, navSearch]);

  const toggleSection = (section: string) => setExpandedSections(prev => prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]);
  const isParentActive = useCallback((item: any) => item.subItems ? item.subItems.some((sub: any) => pathname === sub.href || pathname.startsWith(sub.href + '/')) : pathname === item.href, [pathname]);
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email ?? '';

  return (
    <aside onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} className={`${collapsed ? designTokens.layout.sidebarWidthCollapsed : designTokens.layout.sidebarWidth} ${designTokens.colors.background.main} border-r ${designTokens.colors.border.default} h-screen sticky top-0 flex flex-col transition-all duration-300 ease-in-out z-50`}>
      <div className="p-4 border-b border-slate-800 flex items-center justify-between"><Link href="/dashboard" className="font-black text-white">CentralHub</Link>{onToggleCollapse && <button onClick={onToggleCollapse} className="text-slate-400">{collapsed ? '→' : '←'}</button>}</div>
      <div className="p-3"><input value={navSearch} onChange={e => setNavSearch(e.target.value)} placeholder="Search navigation..." className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" /></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {navItems.map((item: any) => item.subItems ? <div key={item.key}><button onClick={() => toggleSection(item.key)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest ${isParentActive(item) ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:text-white'}`}><span>{item.icon} {item.label}</span><span>{expandedSections.includes(item.key) ? '−' : '+'}</span></button>{expandedSections.includes(item.key) && !collapsed && <div className="ml-3 mt-1 space-y-1">{item.subItems.map((sub: any) => <Link key={sub.href} href={sub.href} className={`block px-3 py-2 rounded-lg text-xs ${pathname === sub.href ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-200'}`}>{sub.label}{sub.badge ? ` (${sub.badge})` : ''}</Link>)}</div>}</div> : <Link key={item.key} href={item.href} className={`block px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest ${pathname === item.href ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>{item.icon} {item.label}</Link>)}
      </nav>
      <div className="p-3 border-t border-slate-800"><div className="text-xs text-slate-300 font-bold">{displayName}</div><div className="text-[10px] text-slate-500 truncate">{displayEmail}</div><button onClick={() => signOut()} className="mt-2 text-xs text-slate-500 hover:text-white">Sign out</button></div>
    </aside>
  );
}

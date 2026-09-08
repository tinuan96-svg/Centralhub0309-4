'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { StoreService } from '@/lib/services/storeService';
import { AuthService } from '@/lib/services/authService';
import { useAuth } from '@/components/AuthProvider';
import { designTokens } from '@/lib/design-system';

export default function MobileHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { selectedStore, setSelectedStore } = useStore();
  const { isAdmin, disabledNavKeys } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [navSearch, setNavSearch] = useState('');

  useEffect(() => {
    setMounted(true);
    checkAuth();

    const handleToggleMenu = () => setShowMobileMenu(prev => !prev);
    window.addEventListener('toggle-mobile-menu', handleToggleMenu);

    const { data: authListener } = AuthService.onAuthStateChange((event, session) => {
      if (session?.user) setUser(session.user);
      else setUser(null);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
      window.removeEventListener('toggle-mobile-menu', handleToggleMenu);
    };
  }, []);

  useEffect(() => { setShowMobileMenu(false); }, [pathname]);

  const checkAuth = async () => {
    const currentUser = await AuthService.getUser();
    setUser(currentUser);
  };

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
      setShowUserMenu(false);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const allNavItems = useMemo(() => [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠', key: '01 — home' },
    { label: 'Stores', icon: '🏪', key: '02 — stores', subItems: [
      { href: '/stores', label: 'All Stores' },
      { href: '/inventory/visibility', label: 'Store Visibility' },
      { href: '/settings/master-data/stores', label: 'Store Settings' },
    ] },
    { label: 'Sales & Orders', icon: '🛒', key: '03 — sales & orders', subItems: [
      { href: '/orders', label: 'Order Queue' },
      { href: '/customers', label: 'Customers' },
      { href: '/sync-status', label: 'Order Monitor' },
    ] },
    { label: 'Products', icon: '📦', key: '04 — products', subItems: [
      { href: '/inventory', label: 'Product Manager' },
      { href: '/inventory/bulk', label: 'Bulk Manager' },
      { href: '/business-intelligence/executive#approvals', label: 'Product Approvals' },
      { href: '/settings/master-data/categories', label: 'Categories' },
      { href: '/settings/master-data/brands', label: 'Brands' },
      { href: '/marketing/ai', label: 'SEO & Content' },
      { href: '/inventory-management/sync', label: 'Product Sync' },
    ] },
    { label: 'Inventory', icon: '📊', key: '05 — inventory', subItems: [
      { href: '/inventory-management', label: 'Dashboard' },
      { href: '/inventory-management/stock', label: 'Stock List' },
      { href: '/inventory-management/adjustments', label: 'Adjustments' },
      { href: '/inventory-management/movements', label: 'Movements' },
      { href: '/inventory-audit', label: 'Stock Audit' },
      { href: '/inventory-management/reports', label: 'Reports' },
      { href: '/inventory-management/warehouses', label: 'Warehouse & Bins' },
      { href: '/inventory-management/barcode', label: 'Barcode Scanner' },
      { href: '/inventory-management/packaging', label: 'Packaging' },
      { href: '/inventory-management/expiry', label: 'Expiry Management' },
    ] },
    { label: 'Procurement', icon: '🛍️', key: '06 — procurement', subItems: [
      { href: '/procurement', label: 'Procurement Dashboard' },
      { href: '/backorder-planning', label: 'Planning Engine' },
      { href: '/inventory-management/purchase-orders', label: 'Purchase Orders' },
      { href: '/suppliers/invoices', label: 'Supplier Invoices' },
      { href: '/inventory-management/grn', label: 'Goods Received (GRN)' },
      { href: '/suppliers', label: 'All Suppliers' },
      { href: '/suppliers/pricing', label: 'Supplier Pricing' },
      { href: '/suppliers/comparison', label: 'Price Comparison' },
    ] },
    { label: 'Fulfilment', icon: '🚚', key: '07 — fulfilment', subItems: [
      { href: '/picking', label: 'Picking' },
      { href: '/packing', label: 'Packing' },
    ] },
    { label: 'Shipping', icon: '🚛', key: '08 — shipping', subItems: [
      { href: '/shipping', label: 'Shipment List' },
      { href: '/shipping/tracking', label: 'Tracking' },
      { href: '/shipping/calculator', label: 'Cost Calculator' },
    ] },
    { label: 'Customers & Support', icon: '💬', key: '09 — customers & support', subItems: [
      { href: '/customers', label: 'Customers' },
      { href: '/customer-care/inbox', label: 'Support Inbox' },
      { href: '/customer-care/conversations', label: 'Conversations' },
      { href: '/customer-care/tickets', label: 'Tickets' },
      { href: '/customer-care/channels', label: 'WhatsApp Channels' },
      { href: '/customer-care/ai-assistant', label: 'AI Assistant' },
      { href: '/customer-care/knowledge-base', label: 'Knowledge Base' },
      { href: '/customer-care/templates', label: 'Templates' },
      { href: '/customer-care/automations', label: 'Automations' },
    ] },
    { label: 'Marketing', icon: '📣', key: '10 — marketing', subItems: [
      { href: '/marketing', label: 'Overview' },
      { href: '/marketing/campaigns', label: 'Campaigns' },
      { href: '/marketing/promotions', label: 'Promotions' },
      { href: '/marketing/segments', label: 'Segments' },
      { href: '/marketing/calendar', label: 'Calendar' },
      { href: '/marketing/whatsapp', label: 'WhatsApp' },
      { href: '/marketing/email', label: 'Email' },
      { href: '/marketing/social', label: 'Social Media' },
      { href: '/marketing/product-feeds', label: 'Product Feeds' },
      { href: '/marketing/tracking', label: 'Tracking' },
      { href: '/marketing/audiences', label: 'Audiences' },
      { href: '/marketing/creative-library', label: 'Creative Library' },
      { href: '/marketing/budgets', label: 'Marketing Budgets' },
      { href: '/marketing/apps', label: 'App Marketing & Stores' },
      { href: '/marketing/apps/releases', label: 'App Releases' },
      { href: '/marketing/customer-journey', label: 'Customer Journey' },
      { href: '/marketing/alerts', label: 'Marketing Alerts' },
      { href: '/marketing/ai', label: 'AI Marketing & SEO' },
      { href: '/marketing/integrations', label: 'Marketing Integrations' },
      { href: '/marketing/settings', label: 'Marketing Settings' },
    ] },
    { label: 'Analytics', icon: '📈', key: '10.5 — analytics', subItems: [
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
    { label: 'Business Intelligence', icon: '🧠', key: '11 — business intelligence', subItems: [
      { href: '/business-intelligence/executive', label: 'Executive BI' },
      { href: '/business-intelligence/price-opportunities', label: 'Price Opportunities' },
      { href: '/business-intelligence/promotion-simulator', label: 'Promotion Simulator' },
      { href: '/business-intelligence/inventory', label: 'Inventory BI' },
      { href: '/business-intelligence/revenue-margin', label: 'Revenue & Margin' },
      { href: '/business-intelligence/customers', label: 'Customer BI' },
      { href: '/marketing/intelligence', label: 'Marketing BI' },
      { href: '/business-intelligence/ai-usage', label: 'AI Usage' },
      { href: '/business-intelligence/automation', label: 'Automation BI' },
      { href: '/competitors', label: 'Competitor Intelligence' },
      { href: '/pricing', label: 'Pricing Overview' },
      { href: '/pricing/approval', label: 'Pricing Approval Centre' },
      { href: '/pricing?tab=fixing', label: 'Price Fixing' },
      { href: '/pricing?tab=weekly', label: 'Weekly Pricing Strategy' },
      { href: '/pricing?tab=competitors', label: 'Competitive Pricing' },
      { href: '/pricing?tab=rules', label: 'Pricing Rules' },
      { href: '/pricing?tab=history', label: 'Price History' },
    ] },
    { label: 'Finance', icon: '💰', key: '12 — finance', subItems: [
      { href: '/finance', label: 'Finance Overview' },
      { href: '/finance/planning', label: 'Planning & Growth' },
      { href: '/profit-analysis', label: 'Profit Analysis' },
      { href: '/banking', label: 'Bank Accounts & Cashflow' },
      { href: '/finance/ledger', label: 'Chart of Accounts & Ledger' },
      { href: '/finance/transactions', label: 'Bank Reconciliation' },
      { href: '/finance/mollie', label: 'Mollie Audit' },
      { href: '/finance/payables', label: 'Supplier Payables' },
      { href: '/expenses', label: 'Business Expenses' },
      { href: '/finance/p-and-l', label: 'Profit & Loss' },
      { href: '/finance/profitability', label: 'Profitability' },
      { href: '/finance/alerts', label: 'Financial Alerts' },
      { href: '/finance/vat', label: 'VAT Control' },
    ] },
    { label: 'Settings', icon: '⚙️', key: '13 — settings', subItems: [
      { href: '/settings', label: 'System Overview' },
      { href: '/settings/notifications', label: 'Notifications & Phone Alerts' },
      { href: '/site-health', label: 'Site Health' },
      { href: '/settings/users', label: 'User Management' },
      { href: '/inventory-management/reports/audit', label: 'Audit Logs' },
    ] },
  ], []);

  const navItems = useMemo(() => {
    if (!mounted) return [];
    let items = isAdmin ? allNavItems : allNavItems.filter((item) => !disabledNavKeys.includes(item.key));
    if (navSearch.trim()) {
      const q = navSearch.toLowerCase();
      items = items.map(item => {
        if (item.label.toLowerCase().includes(q)) return item;
        if (item.subItems) {
          const filteredSubs = item.subItems.filter(s => s.label.toLowerCase().includes(q));
          if (filteredSubs.length > 0) return { ...item, subItems: filteredSubs };
        }
        return null;
      }).filter(Boolean) as any;
    }
    return items;
  }, [mounted, isAdmin, allNavItems, disabledNavKeys, navSearch]);

  const toggleSection = (section: string) => setExpandedSections(prev => prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]);

  return (
    <>
      <header className="sticky top-0 bg-slate-900 border-b border-slate-800 z-30 shadow-lg pt-safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2"><button onClick={() => setShowMobileMenu(true)} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button></div>
          <div className="flex items-center gap-2"><button onClick={() => setShowUserMenu(true)} className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg"><span className="text-white text-xs font-black">{user?.email?.[0]?.toUpperCase() || 'U'}</span></button></div>
        </div>
      </header>

      {showMobileMenu && (
        <div className="fold-inner:hidden fixed inset-0 z-[60] flex flex-col bg-slate-950 animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-lg"><span className="text-lg">⚡</span></div><h2 className="text-lg font-black text-white uppercase tracking-tighter">CentralHub</h2></div><button onClick={() => setShowMobileMenu(false)} className="p-2 text-slate-400 hover:text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
          <div className="p-4 border-b border-slate-900 bg-slate-950"><div className="relative"><input type="text" value={navSearch} onChange={(e) => setNavSearch(e.target.value)} placeholder="Search navigation..." className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" />{navSearch && <button onClick={() => setNavSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">✕</button>}</div></div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-1 pb-safe">
            {navItems.map((item) => {
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExpanded = expandedSections.includes(item.label.toLowerCase()) || navSearch.trim().length > 0;
              const isActive = pathname === item.href || item.subItems?.some(s => pathname === s.href.split(/[?#]/)[0]);
              return <div key={item.key} className="space-y-1">{hasSubItems ? <><button onClick={() => toggleSection(item.label.toLowerCase())} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-900'}`}><div className="flex items-center gap-3"><span className="text-xl">{item.icon}</span><span className="text-sm font-bold uppercase tracking-wider">{item.label}</span></div><svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>{isExpanded && <div className="ml-11 space-y-1">{item.subItems.map(sub => <Link key={sub.href} href={sub.href} className={`block px-4 py-2.5 rounded-lg text-sm transition-colors ${pathname === sub.href.split(/[?#]/)[0] ? 'text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>{sub.label}</Link>)}</div>}</> : <Link href={item.href || '#'} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-900'}`}><span className="text-xl">{item.icon}</span><span className="text-sm font-bold uppercase tracking-wider">{item.label}</span></Link>}</div>;
            })}
          </nav>
          <div className="p-4 border-t border-slate-800 bg-slate-900/50 pb-safe-bottom"><div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 mb-4"><div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center font-black text-white">{user?.email?.[0]?.toUpperCase()}</div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white truncate">{user?.email}</p><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Administrator</p></div><button onClick={handleLogout} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button></div></div>
        </div>
      )}

      {showUserMenu && (
        <div className="fold-inner:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end animate-in fade-in duration-300" onClick={() => setShowUserMenu(false)}>
          <div className="w-full bg-slate-900 rounded-t-[2rem] border-t border-slate-800 animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between"><h3 className="text-lg font-black text-white uppercase tracking-tight">Account</h3><button onClick={() => setShowUserMenu(false)} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">✕</button></div>
            <div className="p-6 space-y-6 pb-safe-bottom"><div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/30"><div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl ring-2 ring-blue-500/20"><span className="text-white text-xl font-black">{user?.email?.[0]?.toUpperCase() || 'U'}</span></div><div className="min-w-0"><p className="text-base font-bold text-white truncate">{user?.email}</p><p className="text-xs font-black text-slate-500 uppercase tracking-widest">Administrator</p></div></div><div className="grid grid-cols-1 gap-3"><button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-rose-900/20 text-rose-500 border border-rose-500/20 font-black uppercase tracking-widest rounded-2xl hover:bg-rose-900/30 transition-all active:scale-95"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>Sign Out</button></div></div>
          </div>
        </div>
      )}
    </>
  );
}

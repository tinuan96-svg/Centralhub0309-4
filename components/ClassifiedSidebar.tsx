'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { designTokens } from '@/lib/design-system';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

import { sections } from '@/lib/navigation/sections';

export default function ClassifiedSidebar({ collapsed: manualCollapsed = false, onToggleCollapse }: { collapsed?: boolean; onToggleCollapse?: () => void }) {
  const pathname = usePathname();
  const { isAdmin, isStaff, permissions, disabledNavKeys, user, signOut } = useAuth();
  const [navSearch, setNavSearch] = useState('');
  const [expanded, setExpanded] = useState<string[]>(['01-command']);
  const [mounted, setMounted] = useState(false);
  const [width, setWidth] = useState(1200);
  const [sidebarPreference, setSidebarPreference] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ pendingOrders: 0, lowStock: 0, backorders: 0, tickets: 0 });
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const navScrollRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const active = useCallback((href: string) => {
    const base = href.split(/[?#]/)[0];
    return pathname === base || pathname.startsWith(base + '/');
  }, [pathname]);

  const currentSectionKey = useMemo(
    () => sections.find(section => section.items.some(item => active(item.href)))?.key || null,
    [active]
  );

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
    if (savedCollapse === 'true' || savedCollapse === 'false') setSidebarPreference(savedCollapse === 'true');
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { fetchStats(); const id = setInterval(fetchStats, 300000); return () => clearInterval(id); }, [fetchStats]);
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_classified_sections');
    if (saved) { try { setExpanded(JSON.parse(saved)); } catch {} }
    const last = sessionStorage.getItem('sidebar_classified_last_section');
    if (last) setExpanded(v => v.includes(last) ? v : [...v, last]);
  }, []);
  useEffect(() => { if (mounted) localStorage.setItem('sidebar_classified_sections', JSON.stringify(expanded)); }, [expanded, mounted]);
  useEffect(() => {
    if (currentSectionKey && !expanded.includes(currentSectionKey)) setExpanded(v => [...v, currentSectionKey]);
  }, [currentSectionKey, expanded]);

  const counts: Record<string, number> = { '02-network-sales': stats.pendingOrders, '03-catalog-inventory': stats.lowStock, '04-procurement': stats.backorders, '06-customer-growth': stats.tickets };
  const sectionPermission: Record<string,string[]> = {
    '01-command':['dashboard.view'],
    '02-network-sales':['stores.view','orders.view','customers.view'],
    '03-catalog-inventory':['products.view','inventory.view'],
    '04-procurement':['procurement.view'],
    '05-fulfilment':['fulfilment.view','shipping.view'],
    '06-customer-growth':['support.view'],
    '10-marketing':['marketing.view'],
    '07-analytics':['analytics.view'],
    '07-intelligence':['analytics.view'],
    '07-pricing':['pricing.view'],
    '08-finance':['finance.view'],
    '08-hr-payroll':[], // Phase 1 HR is Super Admin only; staff need distinct HR roles and verified RLS before access.
    '08.5-developer':['security.view'],
    '09-system':['settings.view','security.view','users.view'],
  };
  const filtered = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    const allowed = isAdmin ? sections : isStaff
      ? sections.filter(section => (sectionPermission[section.key]||[]).some(permission=>permissions.includes(permission)))
      : sections.filter(s => !disabledNavKeys.includes(s.key));
    if (!q) return allowed;
    return allowed.map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(q) || i.href.toLowerCase().includes(q)) })).filter(s => s.label.toLowerCase().includes(q) || s.items.length);
  }, [navSearch, isAdmin, isStaff, permissions, disabledNavKeys]);

  // Keep the sidebar stable on desktop/fold layouts. Only narrow phone-sized views
  // auto-collapse after navigation; the active section and scroll position persist.
  const autoCollapsed = width < 900;
  const collapsed = manualCollapsed || (sidebarPreference ?? autoCollapsed);

  const setCollapsed = useCallback((next: boolean) => {
    if (manualCollapsed) {
      if (next !== manualCollapsed) onToggleCollapse?.();
      return;
    }
    setSidebarPreference(next);
    localStorage.setItem('sidebar_classified_collapsed_v2', String(next));
  }, [manualCollapsed, onToggleCollapse]);

  const keepSectionVisible = useCallback((key: string | null, behavior: ScrollBehavior = 'auto') => {
    const nav = navScrollRef.current;
    if (!nav) return;
    if (!key) {
      const saved = Number(sessionStorage.getItem('sidebar_classified_scroll_top') || '0');
      if (Number.isFinite(saved) && saved >= 0) nav.scrollTop = saved;
      return;
    }
    const section = sectionRefs.current[key];
    if (!section) return;
    const navRect = nav.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const padding = 18;
    if (sectionRect.top < navRect.top + padding || sectionRect.bottom > navRect.bottom - padding) {
      const target = nav.scrollTop + sectionRect.top - navRect.top - Math.max(16, (navRect.height - sectionRect.height) / 3);
      nav.scrollTo({ top: Math.max(0, target), behavior });
    }
  }, []);

  useEffect(() => {
    if (!mounted || collapsed) return;
    const frame = requestAnimationFrame(() => keepSectionVisible(currentSectionKey, 'auto'));
    return () => cancelAnimationFrame(frame);
  }, [mounted, collapsed, currentSectionKey, expanded, keepSectionVisible]);

  const collapseAfterNavigation = useCallback(() => {
    if (width < 900) setCollapsed(true);
  }, [setCollapsed, width]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || collapsed) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    if (dx <= -56 && Math.abs(dx) > Math.abs(dy) * 1.25 && elapsed < 900) setCollapsed(true);
  }, [collapsed, setCollapsed]);

  const toggle = (key: string) => setExpanded(v => v.includes(key) ? v.filter(x => x !== key) : [...v, key]);

  const openSection = useCallback((key: string) => {
    if (collapsed) {
      setExpanded(v => v.includes(key) ? v : [...v, key]);
      setCollapsed(false);
      requestAnimationFrame(() => requestAnimationFrame(() => keepSectionVisible(key, 'smooth')));
      return;
    }
    toggle(key);
  }, [collapsed, keepSectionVisible, setCollapsed]);

  const handleNavScroll = useCallback(() => {
    if (collapsed || !navScrollRef.current) return;
    sessionStorage.setItem('sidebar_classified_scroll_top', String(navScrollRef.current.scrollTop));
  }, [collapsed]);

  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`centralhub-sidebar ${collapsed ? designTokens.layout.sidebarWidthCollapsed : designTokens.layout.sidebarWidth} ${designTokens.colors.background.main} border-r ${designTokens.colors.border.default} h-screen sticky top-0 flex flex-col transition-all duration-300 ease-in-out z-50`}
    >
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
        {collapsed ? <Link href="/dashboard" onClick={collapseAfterNavigation} aria-label="CentralHub dashboard" className="font-black text-white text-sm">CH</Link> : <Link href="/dashboard" onClick={collapseAfterNavigation} className="font-black text-white">CentralHub</Link>}
        <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="min-w-9 min-h-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 touch-manipulation">{collapsed ? '→' : '←'}</button>
      </div>
      {!collapsed && <div className="px-4 pt-3"><div className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-400">Business navigation</div><div className="text-[10px] text-slate-600 mt-1">Organised by what each area is used for</div></div>}
      <div className="p-3">{collapsed ? <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar search" title="Expand sidebar search" className="w-full min-h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-lg touch-manipulation">⌕</button> : <input value={navSearch} onChange={e => setNavSearch(e.target.value)} placeholder="Search navigation..." className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" />}</div>
      <nav ref={navScrollRef} onScroll={handleNavScroll} className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {mounted && filtered.map(section => (
          <div key={section.key} ref={el => { sectionRefs.current[section.key] = el; }} className="mb-1">
            <button type="button" onClick={() => openSection(section.key)} title={collapsed ? `${section.label}: ${section.description}` : section.description} aria-expanded={expanded.includes(section.key)} className={`w-full min-h-[44px] touch-manipulation flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest ${currentSectionKey === section.key ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>
              <span className={collapsed ? 'w-full text-center text-xl' : 'truncate'}>{collapsed ? section.icon : <>{section.icon} {section.label}{counts[section.key] ? <span className="ml-2 text-[9px] text-amber-300">{counts[section.key]}</span> : null}</>}</span>
              {!collapsed && <span>{expanded.includes(section.key) ? '−' : '+'}</span>}
            </button>
            {expanded.includes(section.key) && !collapsed && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {section.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      sessionStorage.setItem('sidebar_classified_last_section', section.key);
                      collapseAfterNavigation();
                    }}
                    className={`block px-3 py-2 rounded-lg text-xs ${active(item.href) ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-200'}`}
                  >
                    {item.label}{item.badge ? ` (${item.badge})` : ''}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-800 flex items-center justify-between"><div className="min-w-0"><div className="text-xs font-bold text-white truncate">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}</div>{!collapsed && <div className="text-[10px] text-slate-600 truncate">{user?.email || ''}</div>}</div><button onClick={signOut} className="text-xs text-slate-500 hover:text-rose-300" title="Sign out">↪</button></div>
    </aside>
  );
}
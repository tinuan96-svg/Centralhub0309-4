'use client';

import { useStore } from '@/lib/store/useStore';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { StoreService } from '@/lib/services/storeService';
import { AuthService } from '@/lib/services/authService';
import { syncOrders } from '@/lib/services/orderSyncClient';
import { designTokens, getInputClasses, Button } from '@/lib/design-system';
import GlobalSearchOverlay from '@/app/dashboard/components/GlobalSearchOverlay';
import NotificationPanel from '@/app/dashboard/components/NotificationPanel';

export default function Topbar() {
  const { selectedStore, stores, setSelectedStore, setStores } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const checkAuth = useCallback(async () => {
    const session = await AuthService.getSession();
    setUser(session?.user ?? null);
  }, []);

  const loadStores = useCallback(async () => {
    setIsLoading(true);
    const storesData = await StoreService.getAllStores();
    setStores(storesData);
    setIsLoading(false);
  }, [setStores]);

  useEffect(() => {
    setMounted(true);
    loadStores();
    checkAuth();

    // Ctrl+K for search
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Auto-sync orders from remote stores on load
    void syncOrders().catch(err => console.error('Auto-sync failed:', err));

    const { data: authListener } = AuthService.onAuthStateChange((event, session) => {
      (async () => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      })();
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      authListener?.subscription?.unsubscribe();
    };
  }, [loadStores, checkAuth]);


  const handleLogout = async () => {
    try {
      await AuthService.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleLogin = () => {
    router.push('/login');
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncOrders = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const data = await syncOrders();

      if (data.failures && data.failures.length > 0) {
        const failedStores = data.failures.map((failure) => failure.store).join(', ');
        alert(`Sync Failed for: ${failedStores}\\n${data.failures.map((failure) => failure.error).join('\\n')}`);
      } else if (data.success) {
        alert(data.message || `Sync Complete!\\n- ${data.imported || 0} Orders\\n- ${data.items_synced || 0} Items`);
        router.refresh();
        window.location.reload();
      } else {
        alert(`Sync Failed: ${data.error || data.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('Sync error details:', err);
      alert(`Sync failed: ${err.message || 'Check your internet connection.'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const showSearch = pathname === '/inventory' || pathname === '/';
  const showBack = pathname !== '/' && pathname !== '/dashboard';

  return (
    <header className={`${designTokens.layout.topbarHeight} ${designTokens.colors.background.overlay} backdrop-blur-xl border-b ${designTokens.colors.border.default} flex items-center justify-between px-4 sm:px-6 sticky top-0 z-40 gap-3 sm:gap-4 min-w-0`}>
      <div className="min-w-0 flex-1 flex items-center gap-3 xl:gap-6">
        <h2 className={`shrink-0 max-w-[11rem] truncate text-lg font-black ${designTokens.colors.text.primary} flex items-center gap-2 uppercase tracking-tighter`}>
          {pathname.includes('/packing') && <><span className="text-xl">📦</span> Packing</>}
          {pathname.includes('/orders') && <><span className="text-xl">🛒</span> Orders</>}
          {pathname.includes('/shipping') && <><span className="text-xl">🚚</span> Shipping</>}
          {pathname.includes('/inventory') && <><span className="text-xl">📊</span> Inventory</>}
          {pathname.includes('/backorder-planning') && <><span className="text-xl">🛍️</span> Procurement</>}
          {pathname.includes('/stores') && <><span className="text-xl">🏪</span> Stores</>}
          {pathname.includes('/dashboard') && <><span className="text-xl">🤖</span> Dashboard</>}
          {pathname === '/' && <><span className="text-xl">⚡</span> CentralHub</>}
        </h2>

        <div className="relative min-w-0 max-w-md flex-1 group">
          <button
            onClick={() => setIsSearchOpen(true)}
            className={`w-full flex items-center justify-between pl-10 pr-4 h-10 ${getInputClasses()} group-hover:border-slate-600 transition-all text-slate-500 text-sm overflow-hidden whitespace-nowrap`}
          >
            <span className="min-w-0 truncate whitespace-nowrap">Global Search (Orders, Products, SKU...)</span>
            <span className="hidden sm:inline-block shrink-0 ml-2 px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ctrl K</span>
          </button>
          <svg
            className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-cyan-400 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleSyncOrders}
          disabled={isSyncing}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            isSyncing
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 shadow-lg shadow-cyan-900/10 active:scale-95'
          }`}
        >
          <svg className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isSyncing ? 'Syncing...' : 'Sync Orders'}
        </button>

        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className={`p-2 rounded-lg transition-all relative ${isNotificationsOpen ? 'text-white bg-slate-800' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
            title="Notifications"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-slate-900" />
          </button>

          <NotificationPanel isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
        </div>

        <div className="flex items-center gap-3 ml-2 pl-4 border-l border-slate-800/60">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden xl:block">
                <p className="text-xs font-bold text-slate-200 leading-none">{user.email?.split('@')[0]}</p>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Administrator</p>
              </div>
              <div className={`w-10 h-10 ${designTokens.colors.gradient.primary} rounded-xl flex items-center justify-center shadow-lg border border-white/10 ring-4 ring-slate-900/50`}>
                <span className="text-white text-base font-black">
                  {user.email?.[0]?.toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
            >
              Login
            </button>
          )}
        </div>
      </div>

      <GlobalSearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </header>
  );
}

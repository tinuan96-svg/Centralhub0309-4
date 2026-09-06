'use client';

import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: <span aria-hidden>🏠</span> },
  { href: '/orders', label: 'Sales', icon: <span aria-hidden>🛒</span> },
  { href: '/inventory', label: 'Inventory', icon: <span aria-hidden>📦</span> },
  { href: '/finance', label: 'Finance', icon: <span aria-hidden>💰</span> },
  { href: 'menu', label: 'More', icon: <span aria-hidden>☰</span> },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => href === '/dashboard'
    ? pathname === '/dashboard'
    : href !== 'menu' && pathname.startsWith(href);

  const navigateFromBottomNav = (href: string) => {
    if (href === pathname) return;

    // Bottom navigation is a top-level module switch, not a new step in the
    // user's page history. Replace the current entry so the device/browser
    // Back action returns to the page the user was actually on before the
    // module switch instead of repeatedly returning to a stale module page
    // such as Bank Reconciliation (/finance/transactions).
    router.replace(href);
  };

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 w-full max-w-full bg-slate-900/98 border-t border-slate-800 z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] pb-safe-bottom"
    >
      <div className="grid grid-cols-5 min-h-16 h-16 w-full max-w-full px-safe-left pr-safe-right">
        {navItems.map(item => {
          const active = isActive(item.href);
          if (item.href === 'menu') {
            return (
              <button
                key="menu-trigger"
                type="button"
                aria-label="Open navigation menu"
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-mobile-menu'))}
                className="min-w-0 flex flex-col items-center justify-center gap-1 text-slate-500 active:bg-slate-800 transition-colors touch-manipulation"
              >
                {item.icon}
                <span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span>
              </button>
            );
          }

          return (
            <button
              key={item.href}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigateFromBottomNav(item.href)}
              className={`min-w-0 flex flex-col items-center justify-center gap-1 transition-all relative active:bg-slate-800 touch-manipulation ${active ? 'text-cyan-400' : 'text-slate-500'}`}
            >
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-cyan-400 rounded-full" />}
              <div className={`transition-transform duration-200 ${active ? 'scale-110 -translate-y-0.5' : ''}`}>{item.icon}</div>
              <span className={`text-[9px] font-black uppercase tracking-tighter ${active ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

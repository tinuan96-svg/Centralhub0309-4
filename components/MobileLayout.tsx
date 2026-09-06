'use client';

import { usePathname, useRouter } from 'next/navigation';
import ClassifiedSidebar from './ClassifiedSidebar';
import Topbar from './Topbar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import QuickActionsFab from '@/app/dashboard/components/QuickActionsFab';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useState, useEffect } from 'react';

interface MobileLayoutProps { children: React.ReactNode; }

export default function MobileLayout({ children }: MobileLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';
  // Treat the Fold7 cover screen and unfolded inner screen as mobile-first.
  // This avoids switching to the dense desktop shell at an awkward Fold width.
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Keep first-entry mobile Back actions inside CentralHub instead of allowing
  // router.back() to hand control back to the browser/PWA and close the app.
  // Normal in-app history is untouched.
  useEffect(() => {
    if (!mounted || isLoginPage || !isMobile) return;

    const handleBackClick = (event: MouseEvent) => {
      if (window.history.length > 1) return;

      const target = event.target as HTMLElement | null;
      const control = target?.closest('button, a');
      if (!control) return;

      const label = (control.textContent || '').trim().toLowerCase();
      const aria = (control.getAttribute('aria-label') || '').toLowerCase();
      const title = (control.getAttribute('title') || '').toLowerCase();
      const looksLikeBack =
        label === '←' ||
        label === 'back' ||
        label === 'go back' ||
        label.startsWith('← back') ||
        label.startsWith('back to ') ||
        aria.includes('back') ||
        title.includes('back');

      if (!looksLikeBack) return;

      event.preventDefault();
      event.stopPropagation();
      router.push(pathname === '/dashboard' ? '/dashboard' : '/dashboard');
    };

    document.addEventListener('click', handleBackClick, true);
    return () => document.removeEventListener('click', handleBackClick, true);
  }, [mounted, isLoginPage, isMobile, pathname, router]);

  if (isLoginPage) return <>{children}</>;
  if (!mounted) return <div className="h-[100dvh] w-full max-w-full overflow-hidden bg-slate-950" />;
  if (isMobile) return (
    <div className="flex flex-col h-[100dvh] w-full max-w-full min-w-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative">
      <MobileHeader />
      <main className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden overscroll-contain px-safe-left pr-safe-right">
        <div className="min-w-0 w-full max-w-full pb-32">{children}</div>
      </main>
      {pathname === '/dashboard' && <QuickActionsFab />}
      <MobileBottomNav />
    </div>
  );
  return (
    <div className="flex h-screen min-w-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      <ClassifiedSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden"><Topbar /><main className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-safe-bottom pr-safe-right pl-safe-left"><div className="max-w-[1920px] min-w-0 mx-auto w-full">{children}</div></main></div>
      {pathname === '/dashboard' && <QuickActionsFab />}
    </div>
  );
}

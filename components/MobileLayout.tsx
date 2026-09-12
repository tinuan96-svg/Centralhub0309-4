'use client';

import { usePathname } from 'next/navigation';
import ClassifiedSidebar from './ClassifiedSidebar';
import Topbar from './Topbar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import DhlInvoiceAutoSync from './DhlInvoiceAutoSync';
import CentralHubLiveUpdate from './CentralHubLiveUpdate';
import NoraAdaptiveVoiceNormalizer from './NoraAdaptiveVoiceNormalizer';
import CentralHubVoiceAssistant from './CentralHubVoiceAssistant';
import NoraConversationSessionSync from './NoraConversationSessionSync';
import NoraLiveActionOverlay from './NoraLiveActionOverlay';
import NoraComputerLauncher from './NoraComputerLauncher';
import QuickActionsFab from '@/app/dashboard/components/QuickActionsFab';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useState, useEffect } from 'react';

interface MobileLayoutProps { children: React.ReactNode; }

export default function MobileLayout({ children }: MobileLayoutProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const section = pathname.split('/')[1] || 'dashboard';
  const isSupportInbox = pathname.startsWith('/customer-care/inbox');
  // Keep the narrow cover display in the mobile shell. The unfolded Fold
  // starts at the shared fold-inner breakpoint and uses the desktop shell.
  const isMobile = useMediaQuery('(max-width: 699px)');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (isLoginPage) return <>{children}</>;
  if (!mounted) return <div className="h-[100dvh] w-full max-w-full overflow-hidden bg-slate-950" />;
  if (isMobile) return (
    <div data-section={section} className="ch-workspace flex flex-col h-[100dvh] w-full max-w-full min-w-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative">
      <DhlInvoiceAutoSync />
      <CentralHubLiveUpdate />
      <MobileHeader />
      <main
        className={isSupportInbox
          ? 'flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden px-safe-left pr-safe-right pb-[calc(4rem+env(safe-area-inset-bottom))]'
          : 'flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden overscroll-contain px-safe-left pr-safe-right'}
      >
        <div className={isSupportInbox
          ? 'h-full min-h-0 min-w-0 w-full max-w-full overflow-hidden'
          : 'min-w-0 w-full max-w-full pb-32'}>
          {children}
        </div>
      </main>
      {pathname === '/dashboard' && <QuickActionsFab />}
      <NoraAdaptiveVoiceNormalizer />
      <CentralHubVoiceAssistant />
      <NoraConversationSessionSync />
      <NoraComputerLauncher />
      <NoraLiveActionOverlay />
      <MobileBottomNav />
    </div>
  );
  return (
    <div data-section={section} className="ch-workspace centralhub-desktop-shell flex h-screen min-w-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      <DhlInvoiceAutoSync />
      <CentralHubLiveUpdate />
      <ClassifiedSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden"><Topbar /><main className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-safe-bottom pr-safe-right pl-safe-left"><div className="max-w-[1920px] min-w-0 mx-auto w-full">{children}</div></main></div>
      {pathname === '/dashboard' && <QuickActionsFab />}
      <NoraAdaptiveVoiceNormalizer />
      <CentralHubVoiceAssistant />
      <NoraConversationSessionSync />
      <NoraComputerLauncher />
      <NoraLiveActionOverlay />
    </div>
  );
}

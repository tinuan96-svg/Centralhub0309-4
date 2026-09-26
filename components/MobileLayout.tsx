'use client';

import { usePathname } from 'next/navigation';
import ClassifiedSidebar from './ClassifiedSidebar';
import Topbar from './Topbar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import DhlInvoiceAutoSync from './DhlInvoiceAutoSync';
import CentralHubLiveUpdate from './CentralHubLiveUpdate';
import NoraAdaptiveVoiceNormalizer from './NoraAdaptiveVoiceNormalizer';
import NoraWakeListenerRecovery from './NoraWakeListenerRecovery';
import ShruthiRealtimeVoiceEnhancer from './ShruthiRealtimeVoiceEnhancer';
import CentralHubVoiceAssistant from './CentralHubVoiceAssistant';
import NoraConversationSessionSync from './NoraConversationSessionSync';
import NoraLiveActionOverlay from './NoraLiveActionOverlay';
import NoraComputerLauncher from './NoraComputerLauncher';
import ShruthiIdentitySkin from './ShruthiIdentitySkin';
import ShruthiSystemInvocationBridge from './ShruthiSystemInvocationBridge';
import ShruthiLearningPulse from './ShruthiLearningPulse';
import ShruthiSecurityGate from './ShruthiSecurityGate';
import QuickActionsFab from '@/app/dashboard/components/QuickActionsFab';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useState, useEffect } from 'react';
import DemoModeBanner from './DemoModeBanner';
import { useDemoMode } from '@/lib/hooks/useDemoMode';

interface MobileLayoutProps { children: React.ReactNode; }

export default function MobileLayout({ children }: MobileLayoutProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/' || pathname === '/login' || pathname === '/staff-test-verify';
  const isDashboard = pathname === '/dashboard';
  const section = pathname.split('/')[1] || 'dashboard';
  const isSupportInbox = pathname.startsWith('/customer-care/inbox') || pathname.startsWith('/customer-care/tickets/chat');
  const isMobile = useMediaQuery('(max-width: 699px)');
  const [mounted, setMounted] = useState(false);
  const { isDemo } = useDemoMode();
  useEffect(() => { setMounted(true); }, []);

  if (isLoginPage) return <>{children}</>;
  if (!mounted) return <div className="h-[100dvh] w-full max-w-full overflow-hidden bg-slate-950" />;

  const dashboardFloatingControlStyles = (
    <style jsx global>{`
      @media (max-width: 699px) {
        /* Folded mobile: reserve a compact dock above the bottom nav.
           No always-on floating button should cover scrollable dashboard cards. */
        .ch-dashboard-route > main {
          margin-bottom: calc(5.25rem + env(safe-area-inset-bottom));
        }
        .ch-dashboard-route [data-dashboard-dock-control="learning"] {
          top: auto !important;
          right: 9.5rem !important;
          bottom: calc(5.6rem + env(safe-area-inset-bottom)) !important;
          transform: none !important;
        }
        .ch-dashboard-route div:has(> button[aria-label="Open quick actions"]),
        .ch-dashboard-route div:has(> button[aria-label="Close quick actions"]) {
          right: 5.25rem !important;
          bottom: calc(5.5rem + env(safe-area-inset-bottom)) !important;
        }

        .ch-dashboard-route [role="menu"][aria-label="Quick actions"] {
          position: fixed !important;
          left: 0.75rem !important;
          right: 0.75rem !important;
          bottom: calc(10rem + env(safe-area-inset-bottom)) !important;
          width: auto !important;
          max-height: calc(100dvh - 12rem) !important;
        }

        .ch-dashboard-route button[aria-label="Open SHRUTHI"],
        .ch-dashboard-route button[aria-label="Talk to SHRUTHI"] {
          right: 1rem !important;
          bottom: calc(5.5rem + env(safe-area-inset-bottom)) !important;
        }
      }

      @media (min-width: 700px) {
        /* Reserve a real bottom control dock on Z Fold inner screens, tablets and desktop.
           The scrollable dashboard ends above the dock, so controls cannot cover KPI/radar data. */
        .ch-dashboard-route.centralhub-desktop-shell > .flex-1 > main {
          margin-bottom: 4.75rem;
        }
        .ch-dashboard-route [data-dashboard-dock-control="learning"] {
          top: auto !important;
          right: 10rem !important;
          bottom: 0.9rem !important;
          transform: none !important;
        }
        .ch-dashboard-route [data-dashboard-dock-control="quick-actions"] {
          right: 5.25rem !important;
          bottom: 1rem !important;
        }
        .ch-dashboard-route div:has(> button[aria-label="Open quick actions"]),
        .ch-dashboard-route div:has(> button[aria-label="Close quick actions"]) {
          right: 5.25rem !important;
          bottom: 1rem !important;
        }

        .ch-dashboard-route [role="menu"][aria-label="Quick actions"] {
          position: absolute !important;
          left: auto !important;
          right: 0 !important;
          bottom: 4.25rem !important;
          width: min(92vw, 420px) !important;
          max-height: min(70vh, 560px) !important;
        }

        .ch-dashboard-route button[aria-label="Open SHRUTHI"],
        .ch-dashboard-route button[aria-label="Talk to SHRUTHI"] {
          right: 1rem !important;
          bottom: 1rem !important;
        }
      }
    `}</style>
  );

  if (isMobile) return (
    <ShruthiSecurityGate>
      <div
        data-section={section}
        className={`ch-workspace flex flex-col h-[100dvh] w-full max-w-full min-w-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative ${isDashboard ? 'ch-dashboard-route' : ''}`}
      >
        {isDashboard && dashboardFloatingControlStyles}
        {!isDemo && <DhlInvoiceAutoSync />}
        {!isDemo && <CentralHubLiveUpdate />}
        <MobileHeader />
        <DemoModeBanner />
        <main
          className={isSupportInbox
            ? 'flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden px-safe-left pr-safe-right pb-[calc(4rem+env(safe-area-inset-bottom))]'
            : 'flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden overscroll-contain px-safe-left pr-safe-right'}
        >
          <div
            className={isSupportInbox
              ? 'h-full min-h-0 min-w-0 w-full max-w-full overflow-hidden'
              : 'min-w-0 w-full max-w-full'}
            style={!isSupportInbox
              ? { paddingBottom: isDashboard ? 'calc(11rem + env(safe-area-inset-bottom))' : '8rem' }
              : undefined}
          >
            {children}
          </div>
        </main>
        {!isDemo && isDashboard && <QuickActionsFab />}
        {!isDemo && <>
          <ShruthiLearningPulse />
          <ShruthiIdentitySkin />
          <NoraAdaptiveVoiceNormalizer />
          <NoraWakeListenerRecovery />
          <ShruthiRealtimeVoiceEnhancer />
          <CentralHubVoiceAssistant />
          <ShruthiSystemInvocationBridge />
          <NoraConversationSessionSync />
          <NoraComputerLauncher />
          <NoraLiveActionOverlay />
        </>}
        <MobileBottomNav />
      </div>
    </ShruthiSecurityGate>
  );

  return (
    <ShruthiSecurityGate>
      <div
        data-section={section}
        className={`ch-workspace centralhub-desktop-shell flex h-[100dvh] min-w-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden ${isDashboard ? 'ch-dashboard-route' : ''}`}
      >
        {isDashboard && dashboardFloatingControlStyles}
        {!isDemo && <DhlInvoiceAutoSync />}
        {!isDemo && <CentralHubLiveUpdate />}
        <ClassifiedSidebar />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <Topbar />
          <DemoModeBanner />
          <main
            className={isSupportInbox
              ? 'flex-1 min-h-0 min-w-0 overflow-hidden pb-safe-bottom pr-safe-right pl-safe-left'
              : 'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-safe-bottom pr-safe-right pl-safe-left'}
          >
            <div
              className={isSupportInbox
                ? 'h-full min-h-0 min-w-0 w-full max-w-[1920px] mx-auto overflow-hidden'
                : 'max-w-[1920px] min-w-0 mx-auto w-full'}
              style={!isSupportInbox && isDashboard
                ? { paddingBottom: '6rem' }
                : undefined}
            >
              {children}
            </div>
          </main>
        </div>
        {!isDemo && isDashboard && <QuickActionsFab />}
        {!isDemo && <>
          <ShruthiLearningPulse />
          <ShruthiIdentitySkin />
          <NoraAdaptiveVoiceNormalizer />
          <NoraWakeListenerRecovery />
          <ShruthiRealtimeVoiceEnhancer />
          <CentralHubVoiceAssistant />
          <ShruthiSystemInvocationBridge />
          <NoraConversationSessionSync />
          <NoraComputerLauncher />
          <NoraLiveActionOverlay />
        </>}
      </div>
    </ShruthiSecurityGate>
  );
}

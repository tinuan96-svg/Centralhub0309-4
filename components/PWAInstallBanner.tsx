'use client';

import { useState, useEffect } from 'react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    // 2. Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error('Service Worker registration failed:', err);
      });
    }

    // 3. Listen for install prompt
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Check if we should show the banner (not dismissed recently)
      const dismissed = localStorage.getItem('pwa-banner-dismissed');
      const lastPrompt = localStorage.getItem('pwa-banner-last-prompt');
      const now = Date.now();

      // If never dismissed OR dismissed more than 7 days ago
      if (!dismissed || (now - parseInt(lastPrompt || '0') > 7 * 24 * 60 * 60 * 1000)) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-banner-dismissed', 'true');
    localStorage.setItem('pwa-banner-last-prompt', Date.now().toString());
  };

  if (!showBanner || isStandalone) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] animate-in slide-in-from-top-10 duration-500">
      <div className="bg-slate-900 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)] rounded-2xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
          <span className="text-2xl">⚡</span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-white uppercase tracking-tight">Download Web App</h3>
          <p className="text-[10px] text-slate-400 leading-tight mt-0.5">Install CentralHub for a faster, full-screen native experience.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase rounded-lg transition-all"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="p-2 text-slate-500 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

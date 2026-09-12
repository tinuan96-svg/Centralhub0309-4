'use client';

import { useEffect } from 'react';

type NativeBridge = {
  getPlatform?: () => string;
  setNoraConversationActive?: (active: boolean) => void;
};

function getNativeBridge(): NativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeBridge }).CentralHubNative;
}

export default function NoraConversationSessionSync() {
  useEffect(() => {
    const bridge = getNativeBridge();
    if (bridge?.getPlatform?.() !== 'android' || !bridge.setNoraConversationActive) return;

    let lastActive: boolean | null = null;

    const sync = () => {
      const active = Boolean(document.querySelector('.nora-screen'));
      if (active === lastActive) return;
      lastActive = active;
      try {
        bridge.setNoraConversationActive?.(active);
      } catch {
        // Native bridge can briefly disappear during a WebView lifecycle transition.
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    const onVisibilityChange = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      try {
        bridge.setNoraConversationActive?.(false);
      } catch {
        // Best-effort shutdown only.
      }
    };
  }, []);

  return null;
}

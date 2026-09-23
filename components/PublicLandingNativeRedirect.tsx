'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';

/** Existing installed native shells that still start at "/" should open the secure app entry instead. */
export default function PublicLandingNativeRedirect() {
  const router = useRouter();

  useEffect(() => {
    const redirectIfNative = () => {
      const bridge = (window as typeof window & { CentralHubNative?: { getPlatform?: () => string } }).CentralHubNative;
      const platform = bridge?.getPlatform?.();
      if (platform === 'android' || platform === 'windows' || Capacitor.isNativePlatform()) {
        router.replace('/login');
        return true;
      }
      return false;
    };

    if (redirectIfNative()) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (redirectIfNative() || attempts >= 12) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}

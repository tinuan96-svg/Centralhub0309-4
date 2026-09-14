'use client';

import { useEffect, useRef } from 'react';

type NativeSecurityBridge = {
  getPlatform?: () => string;
};

function bridge(): NativeSecurityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeSecurityBridge }).CentralHubNative;
}

export default function ShruthiSecurityBiometricAutoStart() {
  const firedForCurrentLockRef = useRef(false);

  useEffect(() => {
    let timer: number | undefined;

    const tick = () => {
      const locked = Boolean((window as any).__centralHubSecurityLocked);

      if (!locked) {
        firedForCurrentLockRef.current = false;
        return;
      }

      if (firedForCurrentLockRef.current || document.visibilityState !== 'visible') return;
      if (bridge()?.getPlatform?.() !== 'android') return;

      firedForCurrentLockRef.current = true;

      // The security phrase is only an activation gesture; Android biometric/device
      // credential remains the real authentication factor. Dispatching the canonical
      // activation here lets the fingerprint prompt become immediately ready when the
      // security gate appears, so touching the enrolled sensor can unlock without an
      // extra on-page fingerprint button.
      window.setTimeout(() => {
        if (!(window as any).__centralHubSecurityLocked) return;
        window.dispatchEvent(new CustomEvent('centralhub:tara-transcript', {
          detail: {
            text: 'SHRUTHI this is Tinu',
            securityNormalized: true,
            biometricAutoStart: true,
          },
        }));
      }, 380);
    };

    tick();
    timer = window.setInterval(tick, 180);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return null;
}

'use client';

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * Go back within CentralHub without allowing a first-page back action to
 * leave/close the app. A same-origin referrer is preferred; otherwise the
 * dashboard is the safe in-app fallback.
 */
export function safeBack(router: AppRouterInstance, fallback = '/dashboard') {
  if (typeof window === 'undefined') return;

  const referrer = document.referrer;
  const sameOriginReferrer = referrer && referrer.startsWith(window.location.origin);

  if (window.history.length > 1 && sameOriginReferrer) {
    router.back();
    return;
  }

  router.push(fallback);
}

'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect media queries in a way that handles hydration correctly.
 * Use tailwind breakpoint strings (e.g. '(min-width: 768px)')
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query, matches]);

  // Always return false during SSR to avoid hydration mismatch
  if (!mounted) return false;

  return matches;
}

export const useIsMobile = () => useMediaQuery('(max-width: 700px)');
export const useIsFoldCover = () => useMediaQuery('(max-width: 500px)');
export const useIsFoldInner = () => useMediaQuery('(min-width: 701px) and (max-width: 1024px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1025px)');

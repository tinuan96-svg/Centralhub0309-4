export type CentralHubDataMode = 'live' | 'demo';

export const CENTRALHUB_DATA_MODE_STORAGE_KEY = 'centralhub:data-mode';
export const CENTRALHUB_DATA_MODE_COOKIE = 'centralhub_data_mode';
export const CENTRALHUB_DATA_MODE_EVENT = 'centralhub:data-mode';

export const DEMO_SUPABASE_URL = process.env.NEXT_PUBLIC_DEMO_SUPABASE_URL || '';
export const DEMO_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_DEMO_SUPABASE_PUBLISHABLE_KEY || '';

export function isDemoConfigured() {
  return Boolean(DEMO_SUPABASE_URL && DEMO_SUPABASE_PUBLISHABLE_KEY);
}

function cookieMode(): CentralHubDataMode | null {
  if (typeof document === 'undefined') return null;
  const value = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(CENTRALHUB_DATA_MODE_COOKIE + '='))
    ?.split('=')[1];
  return value === 'demo' ? 'demo' : value === 'live' ? 'live' : null;
}

export function getCentralHubDataMode(): CentralHubDataMode {
  if (typeof window === 'undefined') return 'live';
  try {
    const stored = window.localStorage.getItem(CENTRALHUB_DATA_MODE_STORAGE_KEY);
    if (stored === 'demo' && isDemoConfigured()) return 'demo';
    if (stored === 'live') return 'live';
  } catch { }
  const cookie = cookieMode();
  return cookie === 'demo' && isDemoConfigured() ? 'demo' : 'live';
}

export function isDemoMode() {
  return getCentralHubDataMode() === 'demo';
}

export function setCentralHubDataMode(mode: CentralHubDataMode) {
  if (typeof window === 'undefined') return;
  const safeMode: CentralHubDataMode = mode === 'demo' && isDemoConfigured() ? 'demo' : 'live';
  try { window.localStorage.setItem(CENTRALHUB_DATA_MODE_STORAGE_KEY, safeMode); } catch { }
  document.cookie = `${CENTRALHUB_DATA_MODE_COOKIE}=${safeMode}; Path=/; Max-Age=2678400; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(CENTRALHUB_DATA_MODE_EVENT, { detail: { mode: safeMode } }));
}

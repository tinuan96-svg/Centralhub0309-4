'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Loading the protected application shell only on non-demo routes prevents the
// public demo from mounting production auth, native voice, push or data-sync code.
const ProtectedAppShell = dynamic(() => import('./ProtectedAppShell'), {
  loading: () => <div className="min-h-[100dvh] bg-slate-950" aria-busy="true" />,
});

export default function AppRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return <>{children}</>;
  return <ProtectedAppShell>{children}</ProtectedAppShell>;
}

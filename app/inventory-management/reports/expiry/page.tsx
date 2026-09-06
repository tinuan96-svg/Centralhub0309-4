'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/inventory-management/expiry');
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="h-7 w-7 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
    </main>
  );
}

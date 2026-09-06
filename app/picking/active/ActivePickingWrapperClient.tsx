'use client';

import { Suspense } from 'react';
import ActivePickingClient from './ActivePickingClient';

export default function ActivePickingWrapperClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>}>
      <ActivePickingClient params={params} searchParams={searchParams} />
    </Suspense>
  );
}

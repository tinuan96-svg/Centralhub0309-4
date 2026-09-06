'use client';

import { Suspense } from 'react';
import PickingClient from './PickingClient';

export default function PickingDetailWrapperClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>}>
      <PickingClient params={params} searchParams={searchParams} />
    </Suspense>
  );
}

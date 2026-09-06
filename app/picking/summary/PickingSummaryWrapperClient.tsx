'use client';

import { Suspense } from 'react';
import SummaryClient from './SummaryClient';

export default function PickingSummaryWrapperClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <Suspense fallback={<div className="h-screen bg-slate-950 flex items-center justify-center"><div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <SummaryClient params={params} searchParams={searchParams} />
    </Suspense>
  );
}

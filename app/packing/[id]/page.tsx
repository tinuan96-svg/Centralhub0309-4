import { Suspense } from 'react';
import PackingVerificationClient from './PackingVerificationClient';

export async function generateStaticParams() {
  return [{ id: '__placeholder' }];
}

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>}>
      <PackingVerificationClient params={params} searchParams={searchParams} />
    </Suspense>
  );
}

'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function CategoryCompatibilityRedirect() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/settings/master-data/categories/${String(id)}${query ? `?${query}` : ''}`);
  }, [id, router, searchParams]);

  return <div className="p-8 text-center text-slate-500 uppercase font-black tracking-widest animate-pulse">Opening category report…</div>;
}

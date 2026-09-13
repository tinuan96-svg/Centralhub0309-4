'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import CategoryDetailClient from '@/app/settings/master-data/categories/[id]/CategoryDetailClient';
import CategoryParentRollup from './CategoryParentRollup';

export default function CategoryDetailRouter() {
  const { id } = useParams();
  const entityId = String(id);
  const [hasChildren, setHasChildren] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from('categories').select('id', { count: 'exact', head: true }).eq('parent_id', entityId)
      .then(({ count }) => { if (active) setHasChildren((count || 0) > 0); })
      .catch(() => { if (active) setHasChildren(false); });
    return () => { active = false; };
  }, [entityId]);

  if (hasChildren === null) return <div className="h-64 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/40" />;
  if (hasChildren) return <CategoryParentRollup entityId={entityId} />;
  return <CategoryDetailClient params={{ id: entityId }} searchParams={{}} />;
}

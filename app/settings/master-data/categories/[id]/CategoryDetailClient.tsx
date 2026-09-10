'use client';

import { useParams } from 'next/navigation';
import UltimateMasterDataReport from '@/components/master-data/UltimateMasterDataReport';

export default function CategoryDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const { id } = useParams();
  return <UltimateMasterDataReport entityType="category" entityId={String(id)} />;
}

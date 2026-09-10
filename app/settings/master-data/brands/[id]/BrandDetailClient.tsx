'use client';

import { useParams } from 'next/navigation';
import UltimateMasterDataReport from '@/components/master-data/UltimateMasterDataReport';

export default function BrandDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const { id } = useParams();
  return <UltimateMasterDataReport entityType="brand" entityId={String(id)} />;
}

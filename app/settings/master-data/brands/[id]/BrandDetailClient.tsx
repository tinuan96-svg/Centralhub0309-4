'use client';

import { useParams } from 'next/navigation';
import MasterDataEntityReport from '@/components/master-data/MasterDataEntityReport';

export default function BrandDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const { id } = useParams();
  return <MasterDataEntityReport entityType="brand" entityId={String(id)} />;
}

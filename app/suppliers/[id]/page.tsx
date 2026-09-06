import SupplierDetailClient from './SupplierDetailClient';

export async function generateStaticParams() {
  return [{ id: 'new' }, { id: '__placeholder' }];
}

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SupplierDetailClient params={params} searchParams={searchParams} />;
}

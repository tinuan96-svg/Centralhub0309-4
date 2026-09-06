import StorePageClient from './StorePageClient';

export async function generateStaticParams() {
  return [{ store_id: '__placeholder' }];
}

export default function StorePage({ params, searchParams }: { params: any; searchParams: any }) {
  return <StorePageClient />;
}

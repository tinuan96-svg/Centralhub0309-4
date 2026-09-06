import GRNDetailClient from './GRNDetailClient';

export async function generateStaticParams() {
  return [{ id: 'new' }, { id: '__placeholder' }];
}

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <GRNDetailClient params={params} searchParams={searchParams} />;
}

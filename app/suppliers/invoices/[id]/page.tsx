import InvoiceDetailClient from './InvoiceDetailClient';

export async function generateStaticParams() {
  return [{ id: 'new' }, { id: '__placeholder' }];
}

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <InvoiceDetailClient params={params} searchParams={searchParams} />;
}

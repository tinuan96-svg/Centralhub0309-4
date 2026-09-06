import StockLedgerClient from './StockLedgerClient';

export async function generateStaticParams() {
  return [{ id: '__placeholder' }];
}

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <StockLedgerClient params={params} searchParams={searchParams} />;
}

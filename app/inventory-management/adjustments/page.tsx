import StockAdjustmentsClient from './StockAdjustmentsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <StockAdjustmentsClient params={params} searchParams={searchParams} />;
}

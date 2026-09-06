import BulkStockAdjustmentClient from "./BulkStockAdjustmentClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <BulkStockAdjustmentClient params={params} searchParams={searchParams} />;
}

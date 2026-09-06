import InventoryBulkClient from './InventoryBulkClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <InventoryBulkClient params={params} searchParams={searchParams} />;
}

import InventoryAuditClient from './InventoryAuditClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <InventoryAuditClient params={params} searchParams={searchParams} />;
}

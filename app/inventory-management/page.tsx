import InventoryManagementClient from './InventoryManagementClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <InventoryManagementClient params={params} searchParams={searchParams} />;
}

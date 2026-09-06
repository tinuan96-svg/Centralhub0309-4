import WarehousesClient from "./WarehousesClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <WarehousesClient params={params} searchParams={searchParams} />;
}

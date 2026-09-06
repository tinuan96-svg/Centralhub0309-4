import InventorySettingsClient from "./InventorySettingsClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <InventorySettingsClient params={params} searchParams={searchParams} />;
}

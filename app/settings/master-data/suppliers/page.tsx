import SuppliersSettingsClient from "./SuppliersSettingsClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SuppliersSettingsClient params={params} searchParams={searchParams} />;
}

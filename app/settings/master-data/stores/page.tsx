import StoresSettingsClient from "./StoresSettingsClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <StoresSettingsClient params={params} searchParams={searchParams} />;
}

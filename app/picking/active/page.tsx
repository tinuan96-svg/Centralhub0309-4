import ActivePickingWrapperClient from "./ActivePickingWrapperClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ActivePickingWrapperClient params={params} searchParams={searchParams} />;
}

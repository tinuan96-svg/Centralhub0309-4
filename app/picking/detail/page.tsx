import PickingDetailWrapperClient from "./PickingDetailWrapperClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <PickingDetailWrapperClient params={params} searchParams={searchParams} />;
}

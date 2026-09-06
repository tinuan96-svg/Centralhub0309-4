import PickingSummaryWrapperClient from "./PickingSummaryWrapperClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <PickingSummaryWrapperClient params={params} searchParams={searchParams} />;
}

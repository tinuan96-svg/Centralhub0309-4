import PriceOpportunitiesClient from "./PriceOpportunitiesClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <PriceOpportunitiesClient params={params} searchParams={searchParams} />;
}

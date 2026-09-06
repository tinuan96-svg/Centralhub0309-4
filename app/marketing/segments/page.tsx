import MarketingSegmentsClient from './MarketingSegmentsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingSegmentsClient params={params} searchParams={searchParams} />;
}

import MarketingPromotionsClient from './MarketingPromotionsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingPromotionsClient params={params} searchParams={searchParams} />;
}

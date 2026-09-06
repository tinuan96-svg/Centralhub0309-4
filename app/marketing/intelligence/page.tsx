import MarketingIntelligenceClient from './MarketingIntelligenceClient';

export default function MarketingIntelligencePage({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingIntelligenceClient params={params} searchParams={searchParams} />;
}

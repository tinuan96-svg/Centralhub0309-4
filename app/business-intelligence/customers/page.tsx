import CustomerIntelligenceClient from './CustomerIntelligenceClient';

export default function CustomerIntelligencePage({ params, searchParams }: { params: any; searchParams: any }) {
  return <CustomerIntelligenceClient params={params} searchParams={searchParams} />;
}

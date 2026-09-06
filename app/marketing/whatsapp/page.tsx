import MarketingWhatsappClient from './MarketingWhatsappClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingWhatsappClient params={params} searchParams={searchParams} />;
}

import MarketingEmailClient from './MarketingEmailClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingEmailClient params={params} searchParams={searchParams} />;
}

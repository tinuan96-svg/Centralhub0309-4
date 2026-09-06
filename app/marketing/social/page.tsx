import MarketingSocialClient from './MarketingSocialClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingSocialClient params={params} searchParams={searchParams} />;
}

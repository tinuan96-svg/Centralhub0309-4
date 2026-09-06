import MarketingCalendarClient from './MarketingCalendarClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingCalendarClient params={params} searchParams={searchParams} />;
}

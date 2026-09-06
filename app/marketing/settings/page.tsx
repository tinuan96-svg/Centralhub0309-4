import MarketingSettingsClient from './MarketingSettingsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MarketingSettingsClient params={params} searchParams={searchParams} />;
}

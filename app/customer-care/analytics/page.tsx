import AnalyticsClient from './AnalyticsClient';

export default function CareAnalyticsPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <AnalyticsClient params={params} searchParams={searchParams} />;
}

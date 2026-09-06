import ExecutiveDashboardClient from './ExecutiveDashboardClient';

export default function ExecutiveBIPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <ExecutiveDashboardClient params={params} searchParams={searchParams} />;
}

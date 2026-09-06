import ProcurementDashboardClient from './ProcurementDashboardClient';

export default function ProcurementPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <ProcurementDashboardClient params={params} searchParams={searchParams} />;
}

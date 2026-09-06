import BackorderPlanningClient from './BackorderPlanningClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <BackorderPlanningClient params={params} searchParams={searchParams} />;
}

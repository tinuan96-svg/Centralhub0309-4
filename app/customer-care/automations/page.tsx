import AutomationsClient from './AutomationsClient';

export default function AutomationsPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <AutomationsClient params={params} searchParams={searchParams} />;
}

import AlertsClient from './AlertsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <AlertsClient params={params} searchParams={searchParams} />;
}

import SyncStatusClient from './SyncStatusClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SyncStatusClient params={params} searchParams={searchParams} />;
}

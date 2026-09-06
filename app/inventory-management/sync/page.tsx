import StoreDatabaseConnectionsClient from "./StoreDatabaseConnectionsClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <StoreDatabaseConnectionsClient params={params} searchParams={searchParams} />;
}

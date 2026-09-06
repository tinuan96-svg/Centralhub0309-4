import PackingQueueClient from "./PackingQueueClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <PackingQueueClient params={params} searchParams={searchParams} />;
}

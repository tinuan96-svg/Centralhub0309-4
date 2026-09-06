import PickingQueueClient from "./PickingQueueClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <PickingQueueClient params={params} searchParams={searchParams} />;
}

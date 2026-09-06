import OrdersClient from './OrdersClient';

export default function OrdersPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <OrdersClient params={params} searchParams={searchParams} />;
}

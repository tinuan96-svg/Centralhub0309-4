import ShippingClient from './ShippingClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ShippingClient params={params} searchParams={searchParams} />;
}

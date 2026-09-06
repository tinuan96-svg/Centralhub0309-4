import ShippingTrackingClient from './ShippingTrackingClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ShippingTrackingClient params={params} searchParams={searchParams} />;
}

import ShippingCalculatorClient from './ShippingCalculatorClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ShippingCalculatorClient params={params} searchParams={searchParams} />;
}

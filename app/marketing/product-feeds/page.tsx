import ProductFeedsClient from './ProductFeedsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ProductFeedsClient params={params} searchParams={searchParams} />;
}

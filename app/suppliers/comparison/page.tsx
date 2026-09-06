import SupplierPriceComparisonClient from "./SupplierPriceComparisonClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SupplierPriceComparisonClient params={params} searchParams={searchParams} />;
}

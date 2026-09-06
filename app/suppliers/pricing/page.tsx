import SupplierPricingClient from "./SupplierPricingClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SupplierPricingClient params={params} searchParams={searchParams} />;
}

import SupplierInvoicesClient from "./SupplierInvoicesClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SupplierInvoicesClient params={params} searchParams={searchParams} />;
}

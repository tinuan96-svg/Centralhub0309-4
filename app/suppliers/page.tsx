import SuppliersClient from "./SuppliersClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <SuppliersClient params={params} searchParams={searchParams} />;
}

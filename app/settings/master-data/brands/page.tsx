import BrandsClient from "./BrandsClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <BrandsClient params={params} searchParams={searchParams} />;
}

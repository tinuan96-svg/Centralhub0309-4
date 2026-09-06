import StockListClient from "./StockListClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <StockListClient params={params} searchParams={searchParams} />;
}

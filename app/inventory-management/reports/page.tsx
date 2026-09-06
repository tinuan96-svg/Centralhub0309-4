import ReportsClient from "./ReportsClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ReportsClient params={params} searchParams={searchParams} />;
}

import GRNClient from "./GRNClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <GRNClient params={params} searchParams={searchParams} />;
}

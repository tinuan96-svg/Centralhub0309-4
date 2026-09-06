import MovementsClient from "./MovementsClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <MovementsClient params={params} searchParams={searchParams} />;
}

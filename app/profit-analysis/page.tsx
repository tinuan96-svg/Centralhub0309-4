import ProfitAnalysisClient from "./ProfitAnalysisClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <ProfitAnalysisClient params={params} searchParams={searchParams} />;
}

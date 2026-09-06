import AuditReportClient from "./AuditReportClient";

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <AuditReportClient params={params} searchParams={searchParams} />;
}

import AIUsageClient from './AIUsageClient';

export default function AIUsagePage({ params, searchParams }: { params: any; searchParams: any }) {
  return <AIUsageClient params={params} searchParams={searchParams} />;
}

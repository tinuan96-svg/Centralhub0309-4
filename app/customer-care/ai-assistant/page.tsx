import AIAssistantClient from './AIAssistantClient';

export default function AIAssistantPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <AIAssistantClient params={params} searchParams={searchParams} />;
}

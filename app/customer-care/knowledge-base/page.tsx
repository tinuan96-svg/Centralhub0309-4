import KnowledgeBaseClient from './KnowledgeBaseClient';

export default function KnowledgeBasePage({ params, searchParams }: { params: any; searchParams: any }) {
  return <KnowledgeBaseClient params={params} searchParams={searchParams} />;
}

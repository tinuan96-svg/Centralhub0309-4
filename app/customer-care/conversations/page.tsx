import ConversationsClient from './ConversationsClient';

export default function ConversationsPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <ConversationsClient params={params} searchParams={searchParams} />;
}

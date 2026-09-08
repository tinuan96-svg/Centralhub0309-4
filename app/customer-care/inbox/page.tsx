import InboxClient from './InboxClient';

export default function InboxPage({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="h-full min-h-0 overflow-hidden [&>div]:!h-full [&>div]:!max-h-full">
      <InboxClient params={params} searchParams={searchParams} />
    </div>
  );
}

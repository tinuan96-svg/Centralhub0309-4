import InboxClient from './InboxClient';

export default function InboxPage({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="h-full">
      <InboxClient params={params} searchParams={searchParams} />
    </div>
  );
}

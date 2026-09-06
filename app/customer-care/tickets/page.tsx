import TicketsClient from './TicketsClient';

export default function TicketsPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <TicketsClient params={params} searchParams={searchParams} />;
}

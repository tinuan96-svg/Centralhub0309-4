import ChannelsClient from './ChannelsClient';

export default function ChannelsPage({ params, searchParams }: { params: any; searchParams: any }) {
  return <ChannelsClient params={params} searchParams={searchParams} />;
}

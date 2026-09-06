import AIMarketingManagerClient from './AIMarketingManagerClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <AIMarketingManagerClient params={params} searchParams={searchParams} />;
}

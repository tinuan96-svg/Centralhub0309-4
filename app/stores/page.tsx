import StoresClient from './StoresClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <StoresClient params={params} searchParams={searchParams} />;
}

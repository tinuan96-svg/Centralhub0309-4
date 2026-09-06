import CustomersClient from './CustomersClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <CustomersClient params={params} searchParams={searchParams} />;
}

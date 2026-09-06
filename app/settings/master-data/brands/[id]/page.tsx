import BrandDetailClient from './BrandDetailClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <BrandDetailClient params={params} searchParams={searchParams} />;
}

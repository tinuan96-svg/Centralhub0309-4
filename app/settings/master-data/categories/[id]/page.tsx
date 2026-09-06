import CategoryDetailClient from './CategoryDetailClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return <CategoryDetailClient params={params} searchParams={searchParams} />;
}

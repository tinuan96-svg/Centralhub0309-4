import ProductWorkspaceNav from '@/components/products/ProductWorkspaceNav';
import CategoryDetailClient from '@/app/settings/master-data/categories/[id]/CategoryDetailClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      <ProductWorkspaceNav />
      <CategoryDetailClient params={params} searchParams={searchParams} />
    </div>
  );
}

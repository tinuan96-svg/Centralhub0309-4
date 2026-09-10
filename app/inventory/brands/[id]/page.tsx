import ProductWorkspaceNav from '@/components/products/ProductWorkspaceNav';
import BrandDetailClient from '@/app/settings/master-data/brands/[id]/BrandDetailClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      <ProductWorkspaceNav />
      <BrandDetailClient params={params} searchParams={searchParams} />
    </div>
  );
}

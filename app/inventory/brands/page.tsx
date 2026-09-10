import ProductWorkspaceNav from '@/components/products/ProductWorkspaceNav';
import BrandsClient from '@/app/settings/master-data/brands/BrandsClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      <ProductWorkspaceNav />
      <BrandsClient params={params} searchParams={searchParams} />
    </div>
  );
}

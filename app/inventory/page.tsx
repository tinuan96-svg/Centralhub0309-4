import ProductWorkspaceNav from '@/components/products/ProductWorkspaceNav';
import InventoryClient from './InventoryClient';

export default function Page({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <>
      <div className="mx-auto max-w-[1800px] px-6 pt-6">
        <ProductWorkspaceNav />
      </div>
      <InventoryClient />
    </>
  );
}

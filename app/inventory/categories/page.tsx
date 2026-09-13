import ProductWorkspaceNav from '@/components/products/ProductWorkspaceNav';
import InventoryCategoriesClient from './InventoryCategoriesClient';

export default function Page() {
  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 fold-inner:p-5 lg:p-6">
      <ProductWorkspaceNav />
      <InventoryCategoriesClient />
    </div>
  );
}

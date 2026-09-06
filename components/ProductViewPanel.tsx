'use client';

import { useEffect, useState } from 'react';
import { ProductService } from '@/lib/services/productService';
import { formatCurrency } from '@/lib/utils/currency';
import ProductImage from '@/components/ProductImage';

interface ProductViewPanelProps {
  productId: string | null;
  onClose: () => void;
  onEdit?: (productId: string) => void;
}

function Field({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <p className="text-[10px] text-slate-500 mb-0.5 uppercase font-bold tracking-wider">{label}</p>
      <p className={`text-sm font-medium ${valueClassName || 'text-slate-200'}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-700/60">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

export default function ProductViewPanel({ productId, onClose, onEdit }: ProductViewPanelProps) {
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) { setProduct(null); return; }
    setLoading(true);
    ProductService.getProductById(productId)
      .then(setProduct)
      .finally(() => setLoading(false));
  }, [productId]);

  const isOpen = !!productId;
  const stock = product?.stock ?? 0;

  return (
    <>
      <div className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed top-0 right-0 h-full w-full max-w-xl bg-slate-900 border-l border-slate-700/60 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-100">Product Details</h2>
          <div className="flex items-center gap-2">
            {onEdit && product && (
              <button onClick={() => { onEdit(product.id); onClose(); }} className="px-3 py-1.5 text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/25">Edit Product</button>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg" aria-label="Close">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" /></div>}
          {!loading && !product && isOpen && <p className="text-sm text-slate-400">Product not found.</p>}
          {!loading && product && (
            <>
              <div className="flex gap-4 mb-6">
                <div className="w-20 h-20 rounded-xl bg-slate-800 border border-slate-700/60 overflow-hidden flex-shrink-0">
                  <ProductImage imageUrl={product.image_url} galleryImages={product.gallery_images} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-100 leading-tight">{product.name}</h3>
                  {product.sku && <p className="text-xs text-slate-500 font-mono mt-0.5">{product.sku}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">{product.product_type || 'simple'}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${product.is_active && !product.is_deleted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{product.is_active && !product.is_deleted ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              </div>

              {product.gallery_images?.length > 1 && <div className="flex gap-2 mb-6 overflow-x-auto pb-1">{product.gallery_images.map((url: string, i: number) => <div key={i} className="w-14 h-14 rounded-lg bg-slate-800 border border-slate-700/60 overflow-hidden flex-shrink-0"><ProductImage imageUrl={url} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" /></div>)}</div>}

              {product.description && <div className="mb-6 p-3 bg-slate-800/50 rounded-lg border border-slate-700/40"><p className="text-xs text-slate-500 mb-1">Description</p><p className="text-sm text-slate-300 leading-relaxed">{product.description}</p></div>}

              <Section title="Pricing">
                <Field label="Selling Price" value={formatCurrency(product.price)} valueClassName="text-amber-400 font-bold" />
                <Field label="Sale Price" value={product.sale_price != null ? formatCurrency(product.sale_price) : undefined} valueClassName="text-emerald-400" />
                <Field label="Cost Price" value={product.cost_price ? formatCurrency(product.cost_price) : undefined} valueClassName="text-rose-400" />
                <Field label="VAT Rate" value={product.vat_rate != null ? `${product.vat_rate}%` : undefined} valueClassName="text-slate-400" />
              </Section>

              <Section title="Central Inventory">
                <div className="col-span-2 bg-slate-800/60 p-4 rounded-xl border border-slate-700/50"><p className="text-[10px] text-slate-500 uppercase font-black mb-1">Stock</p><p className="text-2xl font-black text-slate-100">{stock}</p></div>
                <Field label="Reorder Level" value={product.reorder_level} valueClassName="text-orange-400" />
                <Field label="Stock Tracking" value={product.enable_stock_tracking ? 'Enabled' : 'Disabled'} />
                <Field label="Expiry Date" value={product.expiry_date ? new Date(product.expiry_date).toLocaleDateString('en-GB') : undefined} valueClassName="text-rose-400/80" />
                <Field label="Warehouse Location" value={product.warehouse_location} valueClassName="text-blue-400 font-mono" />
              </Section>

              <Section title="Classification">
                <Field label="Brand" value={product.brand} />
                <Field label="Department" value={product.department} />
                <Field label="Category" value={product.category} />
                <Field label="Subcategory" value={product.subcategory} />
                <Field label="Storage Type" value={product.storage_type} />
                <Field label="Weight (kg)" value={product.weight_kg} />
                <Field label="Unit" value={product.unit} />
                <Field label="GTIN" value={product.gtin} />
              </Section>

              {(product.seo_meta_title || product.seo_meta_description || product.seo_title) && <Section title="SEO"><Field label="Meta Title" value={product.seo_meta_title || product.seo_title} /><Field label="Meta Description" value={product.seo_meta_description} /></Section>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

'use client';

import { resolveProductImageUrl } from '@/lib/utils/imageUrl';

interface MobileProductCardProps {
  product: any;
  onEdit: (product: any) => void;
}

export default function MobileProductCard({ product, onEdit }: MobileProductCardProps) {
  const formatPrice = (amount: number) => `£${Number(amount).toFixed(2)}`;

  const getStockStatus = (quantity: number) => {
    if (quantity === 0) return { text: 'Out', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    if (quantity <= 10) return { text: 'Low', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
    return { text: 'In Stock', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  };

  const stockStatus = getStockStatus(product.stock || 0);

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-4 active:bg-slate-800/80 transition-all shadow-lg">
      <div className="flex gap-4">
        {product.image_url && (
          <div className="w-16 h-16 flex-shrink-0 bg-slate-800 rounded-xl overflow-hidden border border-slate-700/40">
            <img
              src={resolveProductImageUrl(product.image_url) || ''}
              alt={product?.name || 'Product'}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 truncate mb-1">{product?.name || 'Unnamed Product'}</h3>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-base font-bold text-amber-400">
              {formatPrice(product?.base_price || 0)}
            </span>
            {product.override_price && (
              <span className="text-xs text-blue-400 font-medium bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                {formatPrice(product.override_price)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tight border ${stockStatus.color}`}>
              {stockStatus.text} ({product.stock || 0})
            </span>

            <button
              onClick={() => onEdit(product)}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {product.sku && (
        <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center justify-between">
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">SKU: {product.sku}</p>
          {product.brand && <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{product.brand}</p>}
        </div>
      )}
    </div>
  );
}

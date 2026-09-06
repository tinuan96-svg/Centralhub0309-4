'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProductEditModal from '@/components/ProductEditModal';
import type { ResolvedProduct } from '@/lib/types';

interface ComprehensiveProductFormProps {
  productId?: string;
  onSave?: () => void;
  onCancel?: () => void;
}

/**
 * Compatibility entrypoint for the stock editor.
 * The retired multi-store product-assignment architecture is not used here;
 * ProductEditModal edits the canonical products record directly.
 */
export default function ComprehensiveProductForm({
  productId,
  onSave,
  onCancel,
}: ComprehensiveProductFormProps) {
  const [product, setProduct] = useState<ResolvedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      if (!productId) {
        setError('No product selected');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message);
        setProduct(null);
      } else if (!data) {
        setError('Product not found');
        setProduct(null);
      } else {
        setProduct(data as ResolvedProduct);
      }

      setLoading(false);
    }

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">
        Loading product details...
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8">
        <p className="text-sm font-semibold text-rose-400">Unable to load product</p>
        <p className="mt-2 text-sm text-slate-400">{error || 'Product not found'}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <ProductEditModal
      product={product}
      onClose={onCancel || (() => {})}
      onSave={onSave || (() => {})}
    />
  );
}

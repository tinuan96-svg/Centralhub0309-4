'use client';

import { useState, useEffect, useCallback } from 'react';
import { VariantManagementService } from '@/lib/services/products/variantManagementService';
import { VariantPricingService } from '@/lib/services/products/variantPricingService';
import { formatCurrency } from '@/lib/utils/currency';

interface ProductVariantSelectorProps {
  productId: string;
  storeId?: string;
  onVariantSelect?: (variant: any) => void;
  selectedVariantId?: string;
}

export default function ProductVariantSelector({
  productId,
  storeId,
  onVariantSelect,
  selectedVariantId,
}: ProductVariantSelectorProps) {
  const [variants, setVariants] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bestValueId, setBestValueId] = useState<string | null>(null);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    const { data } = await VariantManagementService.getVariantsByProduct(productId);

    if (data && data.length > 0) {
      const activeVariants = data.filter(v => v.is_active);
      setVariants(activeVariants);

      const bestValue = VariantPricingService.findBestValue(activeVariants);
      setBestValueId(bestValue);

      if (!selectedVariant) {
        setSelectedVariant(activeVariants[0]);
        onVariantSelect?.(activeVariants[0]);
      }
    }

    setLoading(false);
  }, [productId, onVariantSelect, selectedVariant]);

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);

  useEffect(() => {
    if (selectedVariantId && variants.length > 0) {
      const variant = variants.find(v => v.id === selectedVariantId);
      if (variant) {
        setSelectedVariant(variant);
      }
    } else if (variants.length > 0 && !selectedVariant) {
      setSelectedVariant(variants[0]);
      onVariantSelect?.(variants[0]);
    }
  }, [selectedVariantId, variants, selectedVariant, onVariantSelect]);

  const handleVariantSelect = (variant: any) => {
    setSelectedVariant(variant);
    onVariantSelect?.(variant);
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-slate-800 rounded-lg"></div>
      </div>
    );
  }

  if (variants.length === 0) {
    return null;
  }

  if (variants.length === 1) {
    const variant = variants[0];
    const pricing = VariantPricingService.calculateVariantPricing(variant);

    return (
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-sm">Size</div>
            <div className="text-slate-100 font-medium">{variant.variant_name}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-100">{formatCurrency(variant.price, 'GBP')}</div>
            <div className="text-xs text-slate-400">{pricing.pricePerUnit.displayText}</div>
          </div>
        </div>
      </div>
    );
  }

  const smallestVariant = [...variants].sort((a, b) => a.unit_value - b.unit_value)[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-300">Select Size</div>
        {selectedVariant && (
          <div className="text-2xl font-bold text-slate-100">
            {formatCurrency(selectedVariant.price, 'GBP')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {variants.map((variant) => {
          const isSelected = selectedVariant?.id === variant.id;
          const isBestValue = variant.id === bestValueId;
          const pricing = VariantPricingService.calculateVariantPricing(variant, smallestVariant);

          return (
            <button
              key={variant.id}
              onClick={() => handleVariantSelect(variant)}
              className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
              }`}
            >
              {isBestValue && (
                <div className="absolute -top-2 right-4 px-2 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded-full">
                  BEST VALUE
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-slate-100 mb-1">{variant.variant_name}</div>
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <div>{pricing.pricePerUnit.displayText}</div>
                    {pricing.savingsPercent && pricing.savingsPercent > 0 && (
                      <div className="text-emerald-400">
                        Save {pricing.savingsPercent.toFixed(0)}% vs smallest size
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-slate-100">
                    {formatCurrency(variant.price, 'GBP')}
                  </div>
                  {variant.stock !== undefined && variant.stock <= 5 && variant.stock > 0 && (
                    <div className="text-xs text-yellow-400">Only {variant.stock} left</div>
                  )}
                  {variant.stock === 0 && (
                    <div className="text-xs text-red-400">Out of stock</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedVariant && (
        <div className="bg-slate-800/50 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between text-slate-300">
            <span>SKU:</span>
            <span className="font-mono">{selectedVariant.sku || 'N/A'}</span>
          </div>
          {selectedVariant.barcode && (
            <div className="flex items-center justify-between text-slate-300 mt-1">
              <span>Barcode:</span>
              <span className="font-mono">{selectedVariant.barcode}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

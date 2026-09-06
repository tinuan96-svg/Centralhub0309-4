'use client';

import { useState, useEffect, useCallback } from 'react';
import { VariantManagementService, ProductVariant } from '@/lib/services/products/variantManagementService';
import { VariantPricingService } from '@/lib/services/products/variantPricingService';
import { VariantAutoGenerationService, GeneratedVariant } from '@/lib/services/products/variantAutoGenerationService';
import { formatCurrency } from '@/lib/utils/currency';

interface ProductVariantManagerProps {
  productId: string;
  productName: string;
  onVariantsChange?: () => void;
}

export default function ProductVariantManager({
  productId,
  productName,
  onVariantsChange,
}: ProductVariantManagerProps) {
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAutoGenerate, setShowAutoGenerate] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);

  const [autoGenConfig, setAutoGenConfig] = useState({
    baseUnitValue: 500,
    unitType: 'g' as 'g' | 'kg' | 'ml' | 'l',
    multipliers: [1, 2, 5],
    basePrice: 0,
    baseCost: 0,
    discountPercent: 5,
    vatRate: 0,
  });

  const [manualVariant, setManualVariant] = useState({
    variant_name: '',
    unit_value: 0,
    unit_type: 'g' as 'g' | 'kg' | 'ml' | 'l',
    price: 0,
    cost_price: 0,
    stock: 0,
    sku: '',
    barcode: '',
    vat_rate: 0,
  });

  const [previewVariants, setPreviewVariants] = useState<GeneratedVariant[]>([]);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    const { data } = await VariantManagementService.getVariantsByProduct(productId);
    setVariants(data || []);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);

  const handleAutoGenerate = async () => {
    const result = await VariantAutoGenerationService.autoGenerateVariants({
      productId,
      productName,
      ...autoGenConfig,
    });

    if (result.success) {
      setShowAutoGenerate(false);
      loadVariants();
      onVariantsChange?.();
    }
  };

  const handlePreview = () => {
    const preview = VariantAutoGenerationService.previewGeneratedVariants({
      productId,
      productName,
      ...autoGenConfig,
    });
    setPreviewVariants(preview);
  };

  const handleAddManual = async () => {
    const variant: ProductVariant = {
      product_id: productId,
      ...manualVariant,
    };

    const { error } = await VariantManagementService.createVariant(variant);

    if (!error) {
      setShowManualAdd(false);
      setManualVariant({
        variant_name: '',
        unit_value: 0,
        unit_type: 'g',
        price: 0,
        cost_price: 0,
        stock: 0,
        sku: '',
        barcode: '',
        vat_rate: 0,
      });
      loadVariants();
      onVariantsChange?.();
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Are you sure you want to delete this variant?')) return;

    const { error } = await VariantManagementService.deleteVariant(variantId);

    if (!error) {
      loadVariants();
      onVariantsChange?.();
    }
  };

  const handleUpdateStock = async (variantId: string, newStock: number) => {
    await VariantManagementService.updateVariant(variantId, { stock: newStock });
    loadVariants();
  };

  if (loading) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6">
        <div className="animate-pulse">Loading variants...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Product Variants</h3>
            <p className="text-sm text-slate-400 mt-1">Manage size, weight, and pack variations</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAutoGenerate(true)}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all text-sm"
            >
              Auto-Generate
            </button>
            <button
              onClick={() => setShowManualAdd(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all text-sm"
            >
              Add Manually
            </button>
          </div>
        </div>

        {variants.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <div className="text-4xl mb-2">📦</div>
            <p>No variants created yet</p>
            <p className="text-sm mt-1">Use auto-generate to create common sizes automatically</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50 border-b border-slate-700">
                <tr>
                  <th className="text-left py-3 px-4 text-slate-300 font-semibold text-xs">Variant</th>
                  <th className="text-left py-3 px-4 text-slate-300 font-semibold text-xs">SKU</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-semibold text-xs">Cost</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-semibold text-xs">Price</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-semibold text-xs">Price/Unit</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-semibold text-xs">Margin</th>
                  <th className="text-right py-3 px-4 text-slate-300 font-semibold text-xs">Stock</th>
                  <th className="text-center py-3 px-4 text-slate-300 font-semibold text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const pricing = VariantPricingService.calculateVariantPricing(variant);
                  return (
                    <tr key={variant.id} className="border-b border-slate-800/50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-100">{variant.variant_name}</div>
                        {variant.barcode && (
                          <div className="text-xs text-slate-400">{variant.barcode}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300 text-sm">{variant.sku || '-'}</td>
                      <td className="py-3 px-4 text-right text-slate-300 text-sm">
                        {formatCurrency(variant.cost_price, 'GBP')}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-100 font-medium text-sm">
                        {formatCurrency(variant.price, 'GBP')}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 text-sm">
                        {pricing.pricePerUnit.displayText}
                      </td>
                      <td className="py-3 px-4 text-right text-sm">
                        <span className={pricing.marginPercent > 20 ? 'text-emerald-400' : pricing.marginPercent > 10 ? 'text-yellow-400' : 'text-red-400'}>
                          {pricing.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          value={variant.stock}
                          onChange={(e) => handleUpdateStock(variant.id, parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm text-right"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDeleteVariant(variant.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAutoGenerate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-slate-100 mb-4">Auto-Generate Variants</h3>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Base Unit Value</label>
                <input
                  type="number"
                  value={autoGenConfig.baseUnitValue}
                  onChange={(e) => setAutoGenConfig({ ...autoGenConfig, baseUnitValue: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Unit Type</label>
                <select
                  value={autoGenConfig.unitType}
                  onChange={(e) => setAutoGenConfig({ ...autoGenConfig, unitType: e.target.value as any })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                >
                  <option value="g">Grams (g)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="l">Liters (l)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Base Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={autoGenConfig.basePrice}
                  onChange={(e) => setAutoGenConfig({ ...autoGenConfig, basePrice: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Base Cost</label>
                <input
                  type="number"
                  step="0.01"
                  value={autoGenConfig.baseCost}
                  onChange={(e) => setAutoGenConfig({ ...autoGenConfig, baseCost: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Bulk Discount %</label>
                <input
                  type="number"
                  value={autoGenConfig.discountPercent}
                  onChange={(e) => setAutoGenConfig({ ...autoGenConfig, discountPercent: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">VAT Rate %</label>
                <input
                  type="number"
                  value={autoGenConfig.vatRate}
                  onChange={(e) => setAutoGenConfig({ ...autoGenConfig, vatRate: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">Size Multipliers</label>
              <div className="flex gap-2">
                {autoGenConfig.multipliers.map((mult, index) => (
                  <input
                    key={index}
                    type="number"
                    value={mult}
                    onChange={(e) => {
                      const newMults = [...autoGenConfig.multipliers];
                      newMults[index] = parseFloat(e.target.value);
                      setAutoGenConfig({ ...autoGenConfig, multipliers: newMults });
                    }}
                    className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-center"
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handlePreview}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all mb-4"
            >
              Preview Variants
            </button>

            {previewVariants.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                <h4 className="font-medium text-slate-200 mb-3">Preview:</h4>
                {previewVariants.map((v, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                    <div className="text-sm text-slate-300">{v.variant_name}</div>
                    <div className="text-sm text-slate-100">{formatCurrency(v.price, 'GBP')}</div>
                    <div className="text-xs text-slate-400">£{v.pricePerUnit.toFixed(2)}/unit</div>
                    <div className="text-xs text-emerald-400">{v.marginPercent.toFixed(1)}%</div>
                    {v.savings && v.savings > 0 && (
                      <div className="text-xs text-yellow-400">Save {v.savings.toFixed(1)}%</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowAutoGenerate(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAutoGenerate}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all"
              >
                Generate Variants
              </button>
            </div>
          </div>
        </div>
      )}

      {showManualAdd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 max-w-2xl w-full">
            <h3 className="text-xl font-semibold text-slate-100 mb-4">Add Variant Manually</h3>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Variant Name</label>
                <input
                  type="text"
                  value={manualVariant.variant_name}
                  onChange={(e) => setManualVariant({ ...manualVariant, variant_name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                  placeholder="e.g., 500g"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">SKU</label>
                <input
                  type="text"
                  value={manualVariant.sku}
                  onChange={(e) => setManualVariant({ ...manualVariant, sku: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Unit Value</label>
                <input
                  type="number"
                  value={manualVariant.unit_value}
                  onChange={(e) => setManualVariant({ ...manualVariant, unit_value: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Unit Type</label>
                <select
                  value={manualVariant.unit_type}
                  onChange={(e) => setManualVariant({ ...manualVariant, unit_type: e.target.value as any })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                >
                  <option value="g">Grams (g)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="l">Liters (l)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualVariant.price}
                  onChange={(e) => setManualVariant({ ...manualVariant, price: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Cost Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualVariant.cost_price}
                  onChange={(e) => setManualVariant({ ...manualVariant, cost_price: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowManualAdd(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManual}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all"
              >
                Add Variant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store/useStore';
import { ProductService } from '@/lib/services/productService';
import { ResolvedProduct } from '@/lib/types';
import ImagePickerModal from './ImagePickerModal';
import { resolveProductImageUrl } from '@/lib/utils/imageUrl';

interface ProductEditModalProps {
  product: ResolvedProduct | null;
  onClose: () => void;
  onSave: () => void;
}

export default function ProductEditModal({
  product,
  onClose,
  onSave,
}: ProductEditModalProps) {
  const { selectedStore } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    image_url: '',
    allow_backorder: false,
    taxable: true,
    vat_rate: 20,
    tax_category: 'standard' as 'standard' | 'reduced' | 'zero' | 'exempt',
    cost_price: 0,
    target_margin: 30,
    min_margin: 15,
    avg_packing_cost_net: 0,
    avg_shipping_cost_net: 0,
    avg_gateway_fee: 2.9,
    auto_price_enabled: false,
  });

  useEffect(() => {
    if (product) {
      const rawGallery: string[] = (product as any).gallery_images || (product.image_url ? [product.image_url] : []);
      setGalleryImages(rawGallery.map(u => resolveProductImageUrl(u) ?? u).filter(Boolean));
      setFormData({
        name: product.name,
        description: product.description,
        price: product.price,
        image_url: product.image_url || '',
        allow_backorder: product.allow_backorder || false,
        taxable: (product as any).taxable !== false,
        vat_rate: (product as any).vat_rate || 20,
        tax_category: (product as any).tax_category || 'standard',
        cost_price: (product as any).cost_price || 0,
        target_margin: (product as any).target_margin || 30,
        min_margin: (product as any).min_margin || 15,
        avg_packing_cost_net: (product as any).avg_packing_cost_net || 0,
        avg_shipping_cost_net: (product as any).avg_shipping_cost_net || 0,
        avg_gateway_fee: (product as any).avg_gateway_fee || 2.9,
        auto_price_enabled: (product as any).auto_price_enabled || false,
      });
    }
  }, [product]);

  const handleSave = async () => {
    if (!product) return;

    if (!formData.name || !formData.name.trim()) {
      alert('Product name is required');
      return;
    }

    if (formData.price <= 0) {
      alert('Product price must be greater than 0');
      return;
    }

    setIsSaving(true);

    try {
      await ProductService.updateProduct(product.id, {
        name: formData.name.trim(),
        description: formData.description,
        price: formData.price,
        image_url: galleryImages[0] || formData.image_url || undefined,
        gallery_images: galleryImages.length > 0 ? galleryImages : undefined,
        allow_backorder: formData.allow_backorder,
        taxable: formData.taxable,
        vat_rate: formData.vat_rate,
        tax_category: formData.tax_category,
        cost_price: formData.cost_price,
        target_margin: formData.target_margin,
        min_margin: formData.min_margin,
        avg_packing_cost_net: formData.avg_packing_cost_net,
        avg_shipping_cost_net: formData.avg_shipping_cost_net,
        avg_gateway_fee: formData.avg_gateway_fee,
        auto_price_enabled: formData.auto_price_enabled,
      });

      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error saving product:', error);
      alert(`Failed to save product:\n\n${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!product) return null;

  const formatPrice = (price: number) => `£${Number(price).toFixed(2)}`;

  return (
    <>
    {showImagePicker && (
      <ImagePickerModal
        multiple={true}
        currentUrls={galleryImages}
        onSelect={(urls) => setGalleryImages(urls)}
        onClose={() => setShowImagePicker(false)}
      />
    )}
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Edit Product</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (£)</label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">Display: {formatPrice(formData.price)}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Taxable Product</label>
                <p className="text-xs text-gray-500 mt-1">Subject to VAT</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, taxable: !formData.taxable })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.taxable ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.taxable ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {formData.taxable && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Category</label>
                  <select
                    value={formData.tax_category}
                    onChange={(e) => {
                      const category = e.target.value as typeof formData.tax_category;
                      const rates = { standard: 20, reduced: 5, zero: 0, exempt: 0 };
                      setFormData({ ...formData, tax_category: category, vat_rate: rates[category] });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="standard">Standard Rate (20%)</option>
                    <option value="reduced">Reduced Rate (5%)</option>
                    <option value="zero">Zero Rate (0%)</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vat_rate}
                    onChange={(e) => setFormData({ ...formData, vat_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Product Images
                {galleryImages.length > 0 && (
                  <span className="ml-2 text-xs text-cyan-600 font-normal">{galleryImages.length} image{galleryImages.length !== 1 ? 's' : ''} · first is primary</span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setShowImagePicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium text-gray-700"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {galleryImages.length > 0 ? 'Edit Gallery' : 'Browse & Select'}
              </button>
            </div>

            {galleryImages.length > 0 ? (
              <div className="grid grid-cols-5 gap-2">
                {galleryImages.map((url, idx) => (
                  <div key={url} className="relative group aspect-square">
                    <img
                      src={resolveProductImageUrl(url) || ''}
                      alt={`Image ${idx + 1}`}
                      className={`w-full h-full object-cover rounded-lg border-2 ${idx === 0 ? 'border-cyan-400' : 'border-gray-200'}`}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {idx === 0 && (
                      <span className="absolute top-0 left-0 bg-cyan-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-tl-lg rounded-br-lg">
                        Primary
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setGalleryImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => setShowImagePicker(true)}
                className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-cyan-400 hover:bg-gray-50 transition-all"
              >
                <svg className="w-7 h-7 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-gray-400">Click to select images</p>
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Allow Backorders</label>
                <p className="text-xs text-gray-500 mt-1">Customers can order when stock is zero</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, allow_backorder: !formData.allow_backorder })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.allow_backorder ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.allow_backorder ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-4">Cost & Pricing</h4>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (£)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Margin (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.target_margin}
                  onChange={(e) => setFormData({ ...formData, target_margin: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Avg Packing Cost (£)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.avg_packing_cost_net}
                  onChange={(e) => setFormData({ ...formData, avg_packing_cost_net: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Avg Shipping Cost (£)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.avg_shipping_cost_net}
                  onChange={(e) => setFormData({ ...formData, avg_shipping_cost_net: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Gateway Fee (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.avg_gateway_fee}
                  onChange={(e) => setFormData({ ...formData, avg_gateway_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

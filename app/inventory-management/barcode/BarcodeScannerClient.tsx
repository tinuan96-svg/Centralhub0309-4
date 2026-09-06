'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProductImage from '@/components/ProductImage';
import { formatCurrency } from '@/lib/utils/currency';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

export default function BarcodeScannerClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [manualCode, setManualCode] = useState('');
  const [scannedProduct, setScannedProduct] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [assigningGtin, setAssigningGtin] = useState<{ productId: string, gtin: string } | null>(null);

  const lookupProduct = async (code: string) => {
    if (!code.trim()) return;
    setSearching(true);
    setNotFound(false);
    setScannedProduct(null);

    const { data } = await supabase
      .from('products')
      .select('id, name, sku, gtin, barcode, stock, price, cost_price, image_url, category, brand')
      .or(`gtin.eq.${code},barcode.eq.${code},sku.eq.${code}`)
      .maybeSingle();

    if (data) {
      setScannedProduct(data);
    } else {
      setNotFound(true);
    }
    setSearching(false);
  };

  const handleAssignGtin = async (productId: string, gtin: string) => {
    setSearching(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ gtin: gtin, updated_at: new Date().toISOString() })
        .eq('id', productId);

      if (error) throw error;
      alert(`Barcode ${gtin} assigned successfully!`);
      lookupProduct(gtin);
    } catch (e: any) {
      alert("Assignment failed: " + e.message);
    } finally {
      setSearching(false);
      setAssigningGtin(null);
    }
  };

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Barcode & Label System</h1>
        <p className="text-sm text-slate-500 mt-1">Scan physical products or print warehouse shelf labels</p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Manual Barcode Entry</h2>
        <p className="text-xs text-slate-500">Enter or scan a barcode (EAN/GTIN or SKU) to look up a product.</p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter barcode or SKU..."
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') lookupProduct(manualCode); }}
            className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
          <button
            onClick={() => lookupProduct(manualCode)}
            disabled={searching || !manualCode.trim()}
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm uppercase tracking-widest transition-all"
          >
            {searching ? 'Searching...' : 'Lookup'}
          </button>
        </div>
      </div>

      {notFound && (
        <div className="bg-rose-900/20 border border-rose-500/30 rounded-2xl p-6 text-center space-y-4">
          <span className="text-3xl mb-2 block">⚠️</span>
          <p className="text-rose-400 font-bold">No product found for code: {manualCode}</p>
          <div className="pt-2">
            <button
              onClick={() => setAssigningGtin({ productId: '', gtin: manualCode })}
              className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold border border-slate-700 hover:bg-slate-700"
            >
              Assign to Existing Product
            </button>
          </div>
        </div>
      )}

      {scannedProduct && (
        <div className="bg-slate-900/50 border border-cyan-500/30 rounded-2xl p-6 shadow-xl">
          <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-4">Product Found</h3>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-xl bg-slate-800 overflow-hidden border border-slate-700/50 flex-shrink-0">
              <ProductImage imageUrl={scannedProduct.image_url} size="thumb" alt={scannedProduct.name} />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-lg font-bold text-slate-100">{scannedProduct.name}</p>
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="text-slate-500">SKU: <span className="text-slate-300 font-mono">{scannedProduct.sku || '—'}</span></span>
                <span className="text-slate-500">GTIN: <span className="text-slate-300 font-mono">{scannedProduct.gtin || scannedProduct.barcode || '—'}</span></span>
                <span className="text-slate-500">Stock: <span className={`font-bold ${Number(scannedProduct.stock) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{scannedProduct.stock}</span></span>
                <span className="text-slate-500">Price: <span className="text-cyan-400 font-bold">{formatCurrency(scannedProduct.price || 0)}</span></span>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                {scannedProduct.category && <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded uppercase font-bold">{scannedProduct.category}</span>}
                {scannedProduct.brand && <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded uppercase font-bold">{scannedProduct.brand}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center space-y-6">
          <div className="w-24 h-24 bg-cyan-500/10 rounded-full flex items-center justify-center text-4xl">📷</div>
          <div className="text-center">
             <h2 className="text-lg font-bold text-white">Camera Scanner</h2>
             <p className="text-sm text-slate-500 mt-1">Use your device camera to scan EAN-13 barcodes</p>
          </div>
          <button
            onClick={() => setShowScanner(true)}
            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all"
          >
             Launch Scanner
          </button>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center space-y-6">
          <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center text-4xl">🖨️</div>
          <div className="text-center">
             <h2 className="text-lg font-bold text-white">Print Labels</h2>
             <p className="text-sm text-slate-500 mt-1">Generate and print barcode labels for your shelves</p>
          </div>
          <button className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all">
             Open Print Tool
          </button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(decodedText) => {
            lookupProduct(decodedText);
            setManualCode(decodedText);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {assigningGtin && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div>
               <h3 className="text-lg font-bold text-white uppercase tracking-tight">Assign Barcode</h3>
               <p className="text-sm text-slate-500 font-mono mt-1">Barcode: {assigningGtin.gtin}</p>
            </div>

            <div className="space-y-4">
               <p className="text-xs text-slate-400">Enter the exact **ID (UUID)** of the product to link this barcode to. You can find this on the product edit page.</p>
               <input
                 type="text"
                 placeholder="Paste Product UUID here..."
                 onChange={(e) => setAssigningGtin({ ...assigningGtin, productId: e.target.value })}
                 className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
               />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleAssignGtin(assigningGtin.productId, assigningGtin.gtin)}
                disabled={!assigningGtin.productId || searching}
                className="flex-[2] py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold uppercase tracking-widest text-xs"
              >
                {searching ? 'Linking...' : 'Confirm Link'}
              </button>
              <button
                onClick={() => setAssigningGtin(null)}
                className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold uppercase tracking-widest text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

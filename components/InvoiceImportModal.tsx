'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

interface InvoiceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: any[]) => void;
  supplierId: string;
}

export default function InvoiceImportModal({ isOpen, onClose, onImport, supplierId }: InvoiceImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setLoading(true);
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      let rows: any[] = [];
      if (ext === 'csv') {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        rows = result.data;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }

      if (rows.length === 0) throw new Error('No data found in file');

      // Fetch mappings for this supplier
      const { data: mappings } = await supabase
        .from('product_suppliers')
        .select('product_id, supplier_sku, supplier_product_name, pack_size, products(name, barcode, gtin)')
        .eq('supplier_id', supplierId);

      const mappingMap = new Map<string, any>();
      mappings?.forEach((m: any) => {
        if (m.supplier_sku) mappingMap.set(m.supplier_sku.toLowerCase(), m);
        if (m.supplier_product_name) mappingMap.set(m.supplier_product_name.toLowerCase(), m);
        const prodName = m.products?.name;
        if (prodName) mappingMap.set(prodName.toLowerCase(), m);
      });

      // Try to find columns
      const headers = Object.keys(rows[0]);
      const findCol = (terms: string[]) => headers.find(h => terms.some(t => h.toLowerCase().includes(t)));

      const nameCol = findCol(['product', 'description', 'name', 'item']);
      const skuCol = findCol(['sku', 'code', 'part']);
      const qtyCol = findCol(['qty', 'quantity', 'units']);
      const costCol = findCol(['cost', 'price', 'rate', 'amount']);
      const packSizeCol = findCol(['pack size', 'per pack']);

      if (!nameCol && !skuCol) throw new Error('Could not identify product name or SKU column');

      const importedItems = rows.map(row => {
        const rowName = String(row[nameCol || ''] || '').trim();
        const rowSku = String(row[skuCol || ''] || '').trim();

        // Match product
        let match = rowSku ? mappingMap.get(rowSku.toLowerCase()) : null;
        if (!match && rowName) match = mappingMap.get(rowName.toLowerCase());

        const qty = parseFloat(String(row[qtyCol || ''] || '0').replace(/[^0-9.]/g, '')) || 0;
        const cost = parseFloat(String(row[costCol || ''] || '0').replace(/[^0-9.]/g, '')) || 0;
        const packSize = parseInt(String(row[packSizeCol || ''] || match?.pack_size || '1')) || 1;

        return {
          product_name: match?.products?.name || rowName || 'Unknown Product',
          packs: qty,
          pack_size: packSize,
          units_total: qty * packSize,
          cost_per_pack: cost,
          total_cost: qty * cost,
          product_id: match?.product_id || null
        };
      }).filter(i => i.packs > 0);

      onImport(importedItems);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white uppercase tracking-tight">Import Invoice Items</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <div
          onClick={() => !loading && fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-700 rounded-2xl p-10 text-center hover:border-cyan-500/50 hover:bg-cyan-500/5 cursor-pointer transition-all"
        >
          {loading ? (
            <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <span className="text-4xl mb-4 block">📄</span>
              <p className="text-white font-bold">Select Invoice CSV/Excel</p>
              <p className="text-xs text-slate-500 mt-2 text-balance">The system will automatically match rows to your products using supplier codes and names</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
          />
        </div>

        <div className="mt-6">
           <button onClick={onClose} className="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition-all">Cancel</button>
        </div>
      </div>
    </div>
  );
}

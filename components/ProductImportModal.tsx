'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedRow {
  name: string;
  sku: string;
  gtin: string;
  brand: string;
  category: string;
  price: number;
  cost_price: number;
  stock: number;
  unit: string;
  pack_size: number;
  pack_unit: string;
  warehouse_location: string;
  expiry_date: string;
  is_active: boolean;
  description: string;
  image_url: string;
}

const TEMPLATE_COLUMNS = [
  'name', 'sku', 'gtin', 'brand', 'category', 'price', 'cost_price',
  'stock', 'unit', 'pack_size', 'pack_unit', 'warehouse_location',
  'expiry_date', 'is_active',
  'description', 'image_url'
];

const COLUMN_ALIASES: Record<string, string> = {
  'name': 'name',
  'product name': 'name',
  'product_name': 'name',
  'title': 'name',
  'sku': 'sku',
  'gtin': 'gtin',
  'barcode': 'gtin',
  'ean': 'gtin',
  'brand': 'brand',
  'category': 'category',
  'main_category': 'category',
  'price': 'price',
  'sell_price': 'price',
  'selling_price': 'price',
  'cost_price': 'cost_price',
  'cost': 'cost_price',
  'stock': 'stock',
  'quantity': 'stock',
  'stock_quantity': 'stock',
  'unit': 'unit',
  'weight_unit': 'unit',
  'pack_size': 'pack_size',
  'pack_unit': 'pack_unit',
  'warehouse_location': 'warehouse_location',
  'location': 'warehouse_location',
  'low_stock_threshold': 'low_stock_threshold',
  'low_stock': 'low_stock_threshold',
  'reorder_level': 'reorder_level',
  'reorder_point': 'reorder_level',
  'expiry_date': 'expiry_date',
  'expiry': 'expiry_date',
  'is_active': 'is_active',
  'active': 'is_active',
  'description': 'description',
  'image_url': 'image_url',
  'image': 'image_url',
};

type ImportPhase = 'upload' | 'preview' | 'importing' | 'done';

export default function ProductImportModal({ isOpen, onClose, onImportComplete }: ProductImportModalProps) {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [stats, setStats] = useState<{ created: number; updated: number; skipped: number }>({ created: 0, updated: 0, skipped: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase('upload');
    setParsedRows([]);
    setErrors([]);
    setStats({ created: 0, updated: 0, skipped: 0 });
    setImportProgress(0);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const normalizeKey = (key: string): string => {
    const lower = key.toLowerCase().trim();
    return COLUMN_ALIASES[lower] || lower;
  };

  const parseRow = useCallback((raw: Record<string, unknown>): ParsedRow | null => {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      normalized[normalizeKey(k)] = v;
    }

    const name = String(normalized['name'] || '').trim();
    if (!name) return null;

    const parseNum = (val: unknown, def = 0): number => {
      const n = parseFloat(String(val || '').replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? def : n;
    };

    const parseBool = (val: unknown): boolean => {
      const s = String(val || '').toLowerCase().trim();
      return s === 'true' || s === '1' || s === 'yes' || s === 'active' || val === true;
    };

    return {
      name,
      sku: String(normalized['sku'] || '').trim() || null as unknown as string,
      gtin: String(normalized['gtin'] || '').trim() || null as unknown as string,
      brand: String(normalized['brand'] || '').trim() || null as unknown as string,
      category: String(normalized['category'] || '').trim() || null as unknown as string,
      price: parseNum(normalized['price']),
      cost_price: parseNum(normalized['cost_price']),
      stock: parseNum(normalized['stock']),
      unit: String(normalized['unit'] || '').trim() || null as unknown as string,
      pack_size: parseNum(normalized['pack_size'], 1),
      pack_unit: String(normalized['pack_unit'] || '').trim() || null as unknown as string,
      warehouse_location: String(normalized['warehouse_location'] || '').trim() || null as unknown as string,
      expiry_date: String(normalized['expiry_date'] || '').trim() || null as unknown as string,
      is_active: parseBool(normalized['is_active']),
      description: String(normalized['description'] || '').trim() || null as unknown as string,
      image_url: String(normalized['image_url'] || '').trim() || null as unknown as string,
    };
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setErrors([]);
    setParsedRows([]);

    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: ParsedRow[] = [];
    let parseErrors: string[] = [];

    try {
      if (ext === 'csv') {
        const text = await file.text();
        const result = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h: string) => h.trim(),
        });

        if (result.errors.length > 0) {
          parseErrors = result.errors.map(e => `Row ${e.row}: ${e.message}`);
        }

        for (const raw of result.data) {
          const parsed = parseRow(raw);
          if (parsed) rows.push(parsed);
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        for (const raw of json) {
          const parsed = parseRow(raw);
          if (parsed) rows.push(parsed);
        }
      } else {
        parseErrors.push(`Unsupported file type: .${ext}. Please upload a CSV or Excel file.`);
      }
    } catch (err: any) {
      parseErrors.push(`Failed to parse file: ${err.message}`);
    }

    if (rows.length === 0 && parseErrors.length === 0) {
      parseErrors.push('No valid product rows found. Make sure the file has a "name" column.');
    }

    setParsedRows(rows);
    setErrors(parseErrors);

    if (rows.length > 0) {
      setPhase('preview');
    }
  }, [parseRow]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse([TEMPLATE_COLUMNS]);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    setPhase('importing');
    setImportProgress(0);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Fetch existing products by SKU to determine create vs update
    const skus = parsedRows.filter(r => r.sku).map(r => r.sku);
    const existingMap = new Map<string, string>();

    if (skus.length > 0) {
      // Query in batches of 50 to avoid URL length limits
      for (let i = 0; i < skus.length; i += 50) {
        const batch = skus.slice(i, i + 50);
        const { data } = await supabase
          .from('products')
          .select('id, sku')
          .in('sku', batch);
        (data || []).forEach((p: any) => {
          if (p.sku) existingMap.set(p.sku, p.id);
        });
      }
    }

    const BATCH_SIZE = 25;
    const total = parsedRows.length;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = parsedRows.slice(i, i + BATCH_SIZE);
      const toInsert: any[] = [];
      const toUpdate: { id: string; data: any }[] = [];

      for (const row of batch) {
        const payload: any = {
          name: row.name,
          price: row.price,
          stock: row.stock,
          pack_size: row.pack_size,
          backorder: false,
          reorder_frequency: 'manual',
          is_active: row.is_active,
          updated_at: new Date().toISOString(),
        };

        if (row.sku) payload.sku = row.sku;
        if (row.gtin) payload.gtin = row.gtin;
        if (row.brand) payload.brand = row.brand;
        if (row.category) payload.category = row.category;
        if (row.cost_price) payload.cost_price = row.cost_price;
        if (row.unit) payload.unit = row.unit;
        if (row.pack_unit) payload.pack_unit = row.pack_unit;
        if (row.warehouse_location) payload.warehouse_location = row.warehouse_location;
        if (row.expiry_date) payload.expiry_date = row.expiry_date;
        if (row.description) payload.description = row.description;
        if (row.image_url) payload.image_url = row.image_url;

        if (row.sku && existingMap.has(row.sku)) {
          toUpdate.push({ id: existingMap.get(row.sku)!, data: payload });
        } else {
          toInsert.push(payload);
        }
      }

      // Insert new products
      if (toInsert.length > 0) {
        // Separate products and initial inventory
        const productsToInsert = toInsert.map(({ stock, ...rest }) => rest);

        const { data: insertedData, error } = await supabase.from('products').insert(productsToInsert).select('id');

        if (error) {
          console.error('Import insert error:', error.message);
          skipped += toInsert.length;
        } else {
          // Add central_inventory for new products
          if (insertedData) {
            const inventoryToInsert = insertedData.map((p, idx) => ({
              product_id: p.id,
              stock_quantity: toInsert[idx].stock || 0,
              updated_at: new Date().toISOString()
            }));
            await supabase.from('central_inventory').upsert(inventoryToInsert);
          }
          created += toInsert.length;
        }
      }

      // Update existing products
      for (const item of toUpdate) {
        // Extract stock from payload to update central_inventory separately
        const { stock, ...productData } = item.data;

        const { error } = await supabase.from('products').update(productData).eq('id', item.id);
        if (error) {
          console.error('Import update error:', error.message);
          skipped++;
        } else {
          // Update central_inventory for existing product
          if (stock !== undefined) {
            await supabase.from('central_inventory').upsert({
              product_id: item.id,
              stock_quantity: stock,
              updated_at: new Date().toISOString()
            });
          }
          updated++;
        }
      }

      setImportProgress(Math.min(100, Math.round(((i + batch.length) / total) * 100)));
    }

    setStats({ created, updated, skipped });
    setPhase('done');
    onImportComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-tight">Bulk Import Products</h2>
            <p className="text-sm text-slate-400 mt-1">Upload a CSV or Excel file to create or update products</p>
          </div>
          <button onClick={handleClose} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all">✕</button>
        </div>

        {/* Upload Phase */}
        {phase === 'upload' && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragOver ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'}`}
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="text-sm font-bold text-slate-300">Drop your file here or click to browse</p>
              <p className="text-xs text-slate-500 mt-1">Supports .csv, .xlsx, .xls</p>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} className="hidden" />
            </div>

            <div className="flex items-center justify-between">
              <button onClick={downloadTemplate} className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download CSV Template
              </button>
              <span className="text-[10px] text-slate-600 uppercase tracking-widest">Products matched by SKU</span>
            </div>

            {errors.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 space-y-1">
                {errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-rose-400">{err}</p>
                ))}
                {errors.length > 5 && <p className="text-xs text-rose-500">...and {errors.length - 5} more errors</p>}
              </div>
            )}
          </div>
        )}

        {/* Preview Phase */}
        {phase === 'preview' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-slate-200">Preview: {parsedRows.length} products ready</span>
                <button onClick={() => setPhase('upload')} className="text-xs text-slate-400 hover:text-white transition-colors">Choose different file</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 uppercase tracking-widest text-[9px]">
                      <th className="pb-2 pr-3">Name</th>
                      <th className="pb-2 pr-3">SKU</th>
                      <th className="pb-2 pr-3 text-right">Price</th>
                      <th className="pb-2 pr-3 text-right">Stock</th>
                      <th className="pb-2 pr-3">Brand</th>
                      <th className="pb-2 pr-3">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {parsedRows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="text-slate-300">
                        <td className="py-2 pr-3 font-medium text-slate-200 max-w-[160px] truncate">{row.name}</td>
                        <td className="py-2 pr-3 font-mono text-slate-500">{row.sku || '—'}</td>
                        <td className="py-2 pr-3 text-right font-mono text-cyan-400">{row.price.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{row.stock}</td>
                        <td className="py-2 pr-3 text-slate-400">{row.brand || '—'}</td>
                        <td className="py-2 pr-3 text-slate-400">{row.category || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 8 && (
                <p className="text-xs text-slate-500 mt-2 text-center">...and {parsedRows.length - 8} more rows</p>
              )}
            </div>

            {errors.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                <p className="text-xs text-amber-400 font-bold mb-1">{errors.length} rows skipped</p>
                <p className="text-[10px] text-amber-500/70">These rows had missing required fields and were excluded from the import.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={runImport} className="flex-[2] py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-cyan-900/20">
                Import {parsedRows.length} Products
              </button>
              <button onClick={handleClose} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-700 transition-all text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Importing Phase */}
        {phase === 'importing' && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <div className="inline-block w-12 h-12 border-4 border-slate-700 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
              <p className="text-sm font-bold text-slate-200">Importing products...</p>
              <p className="text-xs text-slate-500 mt-1">Please do not close this window</p>
            </div>
            <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
              <div className="bg-cyan-500 h-full rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
            </div>
            <p className="text-center text-xs text-slate-400 font-mono">{importProgress}%</p>
          </div>
        )}

        {/* Done Phase */}
        {phase === 'done' && (
          <div className="space-y-6 py-4">
            <div className="text-center">
              <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 items-center justify-center mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-lg font-bold text-white">Import Complete</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-emerald-500/20">
                <p className="text-2xl font-black text-emerald-400">{stats.created}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Created</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-cyan-500/20">
                <p className="text-2xl font-black text-cyan-400">{stats.updated}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Updated</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-rose-500/20">
                <p className="text-2xl font-black text-rose-400">{stats.skipped}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Skipped</p>
              </div>
            </div>

            {stats.skipped > 0 && (
              <p className="text-xs text-rose-400/70 text-center">Some products were skipped due to errors. Check the browser console for details.</p>
            )}

            <button onClick={handleClose} className="w-full py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all text-sm">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

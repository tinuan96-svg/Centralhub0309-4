'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Supplier } from '@/lib/services/suppliers/supplierService';
import { formatCurrency } from '@/lib/utils/currency';

interface SupplierPriceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  suppliers: Supplier[];
}

interface PriceListItem {
  supplier_sku: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  case_price?: number;
  unit_price?: number;
  product_type?: string;
  unit_of_measure?: string;
  pack_size: number | string;
  case_quantity: number;
  vat_rate: number;
  supplier_comment?: string;
  is_out_of_stock?: boolean;
  is_category_header?: boolean;
  // Internal matching results
  matched_product_id?: string;
  matched_product_name?: string;
  current_price?: number;
  price_diff?: number;
  status: 'new' | 'increase' | 'decrease' | 'unchanged' | 'unmatched' | 'oos' | 'category';
}

type ImportPhase = 'upload' | 'mapping' | 'preview' | 'processing' | 'done';

export default function SupplierPriceImportModal({ isOpen, onClose, onComplete, suppliers }: SupplierPriceImportModalProps) {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [headers, setRawHeaders] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<Record<string, string>>({
    supplier_sku: '',
    barcode: '',
    name: '',
    brand: '',
    category: '',
    price: '',
    case_price: '',
    unit_price: '',
    product_type: '',
    pack_size: '',
    case_quantity: '',
    vat_rate: '',
    supplier_comment: '',
  });
  const [specialRules, setSpecialRules] = useState<any>({});
  const [previewItems, setPreviewItems] = useState<PriceListItem[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [stats, setStats] = useState({ updated: 0, created: 0, errors: 0, oos: 0 });
  const [fileName, setFileName] = useState('');
  const [fileObject, setFileObject] = useState<File | null>(null);
  const [detectOosByColor, setDetectOosByColor] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const data = [[
      'Supplier SKU',
      'EAN/Barcode',
      'Product Name',
      'Brand',
      'Category',
      'Unit Price',
      'Pack Size',
      'Case Qty',
      'VAT %',
    ]];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "supplier_price_list_template.xlsx");
  };

  const reset = useCallback(() => {
    setPhase('upload');
    setRawRows([]);
    setRawHeaders([]);
    setPreviewItems([]);
    setProcessingProgress(0);
    setFileName('');
    setSheetName('');
    setHeaderRow(1);
    setSpecialRules({});
    setValidationError(null);
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  // Load supplier instructions when supplier is selected
  useEffect(() => {
    if (selectedSupplierId) {
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      if (supplier?.import_instructions) {
        const instr = supplier.import_instructions as any;
        if (instr.mapping) setMapping(prev => ({ ...prev, ...instr.mapping }));
        if (instr.sheet_name) setSheetName(instr.sheet_name);
        if (instr.header_row) setHeaderRow(instr.header_row);
        if (instr.special_rules) setSpecialRules(instr.special_rules);
      } else {
        setMapping({
          supplier_sku: '', barcode: '', name: '', brand: '', category: '',
          price: '', case_price: '', unit_price: '', product_type: '',
          pack_size: '', case_quantity: '', vat_rate: '', supplier_comment: '',
        });
        setSheetName('');
        setHeaderRow(1);
        setSpecialRules({});
      }
    }
  }, [selectedSupplierId, suppliers]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setFileObject(file);
    setValidationError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const text = await file.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          setRawRows(result.data);
          setRawHeaders(result.meta.fields || []);
          setPhase('mapping');
        }
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      // Validation for strict format
      if (specialRules.strict_format) {
        if (sheetName && !workbook.SheetNames.includes(sheetName)) {
           setValidationError(`Expected sheet "${sheetName}" not found in Excel file.`);
           return;
        }
      }

      const targetSheet = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
      setSheetName(targetSheet);

      const sheet = workbook.Sheets[targetSheet];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '', range: headerRow - 1 });

      if (json.length === 0) {
        setValidationError(`No data found on sheet "${targetSheet}" starting from row ${headerRow}.`);
        return;
      }

      const fileHeaders = Object.keys(json[0] as any);
      setRawHeaders(fileHeaders);
      setRawRows(json);

      // Check if all mapped columns exist in the file
      if (specialRules.strict_format) {
        const requiredMappings = ['supplier_sku', 'name', 'price', 'case_price'];
        const missingColumns = Object.entries(mapping)
          .filter(([key, val]) => val && !fileHeaders.includes(val))
          .map(([key, val]) => val);

        if (missingColumns.length > 0) {
          setValidationError(`Missing expected columns: ${missingColumns.join(', ')}`);
          return;
        }

        // If everything matches and it's strict, jump to analysis
        startAnalysis(json, fileHeaders);
      } else {
        setPhase('mapping');
      }
    }
  };

  const startAnalysis = async (rowsOverride?: any[], headersOverride?: string[]) => {
    setPhase('preview');
    const items: PriceListItem[] = [];
    const rowsToProcess = rowsOverride || rawRows;
    const currentHeaders = headersOverride || headers;

    // 1. Fetch current mappings for this supplier to detect changes
    const { data: currentMappings } = await supabase
      .from('product_suppliers')
      .select('product_id, supplier_sku, cost_price, products(name, gtin, barcode, pack_size)')
      .eq('supplier_id', selectedSupplierId);

    const mappingMap = new Map<string, any>();
    const barcodeMap = new Map<string, any>();
    const namePackMap = new Map<string, any>();

    currentMappings?.forEach(m => {
      if (m.supplier_sku) mappingMap.set(m.supplier_sku, m);
      const barcode = (m.products as any)?.gtin || (m.products as any)?.barcode;
      if (barcode) barcodeMap.set(barcode, m);

      const prodName = (m.products as any)?.name;
      const packSize = (m.products as any)?.pack_size;
      if (prodName && packSize) {
        namePackMap.set(`${prodName.toLowerCase()}|${packSize}`, m);
      }
    });

    for (const row of rowsToProcess) {
      const sku = String(row[mapping.supplier_sku] || '').trim();
      const barcode = String(row[mapping.barcode] || '').trim();
      const name = String(row[mapping.name] || '').trim();
      const brand = String(row[mapping.brand] || '').trim();
      const category = String(row[mapping.category] || '').trim();
      const price = parseFloat(String(row[mapping.price] || '0').replace(/[^0-9.]/g, '')) || 0;
      const casePrice = parseFloat(String(row[mapping.case_price] || '0').replace(/[^0-9.]/g, '')) || 0;
      const unitPrice = parseFloat(String(row[mapping.unit_price] || '0').replace(/[^0-9.]/g, '')) || 0;
      const productType = String(row[mapping.product_type] || '').trim();
      const supplierComment = String(row[mapping.supplier_comment] || '').trim();

      // Special rule: Ignore Category Rows (Heading rows with only Name)
      if (specialRules.ignore_category_rows) {
        if (name && !sku && !price && !casePrice && !unitPrice && !row[mapping.pack_size] && !row[mapping.case_quantity]) {
           continue;
        }
      }

      let packSizeValue: string | number = row[mapping.pack_size] || '1';
      let caseQty = parseInt(String(row[mapping.case_quantity] || '1')) || 1;
      let uom = '';

      // Extract pack info from description
      if (specialRules.extract_pack_info && name) {
        const match = name.match(/(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
        if (match) {
          caseQty = parseInt(match[1]) || caseQty;
          packSizeValue = parseFloat(match[2]) || 1;
          uom = match[3];
        }
      }

      const vatRate = parseFloat(String(row[mapping.vat_rate] || '0').replace(/[^0-9.]/g, '')) || 0;

      // OOS detection
      let isOos = false;
      if (detectOosByColor) {
        const rawStyle = (row as any)._style;
        if (rawStyle?.fill?.fgColor?.rgb === 'FFFF0000' || rawStyle?.font?.color?.rgb === 'FFFF0000') {
           isOos = true;
        }
      }

      if (!sku && !barcode && !name) continue;

      let matched = mappingMap.get(sku);
      if (!matched && barcode) matched = barcodeMap.get(barcode);
      if (!matched && name && packSizeValue) matched = namePackMap.get(`${name.toLowerCase()}|${packSizeValue}`);

      let status: PriceListItem['status'] = 'new';
      let currentPriceValue = 0;
      let productId = matched?.product_id;
      let matchedName = (matched?.products as any)?.name;

      if (isOos) {
        status = 'oos';
      } else if (matched) {
        currentPriceValue = matched.cost_price;
        const comparePrice = price || casePrice || unitPrice;
        if (comparePrice > currentPriceValue) status = 'increase';
        else if (comparePrice < currentPriceValue) status = 'decrease';
        else status = 'unchanged';
      } else {
        if (barcode) {
          const { data: globalProd } = await supabase
            .from('products')
            .select('id, name')
            .or(`gtin.eq.${barcode},barcode.eq.${barcode}`)
            .maybeSingle();
          if (globalProd) {
            productId = globalProd.id;
            matchedName = globalProd.name;
          }
        }
        status = productId ? 'new' : 'unmatched';
      }

      items.push({
        supplier_sku: sku,
        barcode,
        name,
        brand,
        category,
        price: price || casePrice || unitPrice,
        case_price: casePrice,
        unit_price: unitPrice,
        product_type: productType,
        unit_of_measure: uom,
        pack_size: typeof packSizeValue === 'number' ? packSizeValue : 1,
        case_quantity: caseQty,
        vat_rate: vatRate,
        supplier_comment: supplierComment,
        is_out_of_stock: isOos,
        matched_product_id: productId,
        matched_product_name: matchedName,
        current_price: currentPriceValue,
        price_diff: currentPriceValue ? (price || casePrice || unitPrice) - currentPriceValue : 0,
        status
      });
    }

    setPreviewItems(items);
  };

  const applyImport = async () => {
    setPhase('processing');
    setProcessingProgress(0);

    try {
      await supabase
        .from('suppliers')
        .update({
          import_instructions: {
            sheet_name: sheetName,
            header_row: headerRow,
            mapping: mapping,
            special_rules: specialRules
          }
        })
        .eq('id', selectedSupplierId);
    } catch (err) {
      console.error('Failed to save import instructions:', err);
    }

    let updated = 0;
    let created = 0;
    let errors = 0;
    let oos = 0;

    const total = previewItems.length;

    for (let i = 0; i < total; i++) {
      const item = previewItems[i];
      if (!item.matched_product_id) {
        errors++;
        continue;
      }

      try {
        const payload: any = {
          supplier_id: selectedSupplierId,
          product_id: item.matched_product_id,
          supplier_sku: item.supplier_sku,
          supplier_barcode: item.barcode,
          supplier_product_name: item.name,
          supplier_brand: item.brand,
          supplier_comment: item.supplier_comment,
          cost_price: item.price,
          case_price: item.case_price,
          unit_price: item.unit_price,
          product_type: item.product_type,
          unit_of_measure: item.unit_of_measure,
          pack_size: typeof item.pack_size === 'number' ? item.pack_size : 1,
          case_quantity: item.case_quantity,
          vat_rate: item.vat_rate,
          previous_cost_price: item.current_price,
          last_price_update: new Date().toISOString(),
          is_active: !item.is_out_of_stock,
        };

        if (item.is_out_of_stock) {
           delete payload.cost_price;
           delete payload.case_price;
           delete payload.unit_price;
           delete payload.previous_cost_price;
        }

        const { error: upsertError } = await supabase
          .from('product_suppliers')
          .upsert(payload, { onConflict: 'product_id,supplier_id' });

        if (upsertError) throw upsertError;

        if (item.is_out_of_stock) oos++;
        else if (item.status === 'new') created++;
        else if (item.status !== 'unchanged') updated++;

      } catch (err) {
        console.error('Import error:', err);
        errors++;
      }

      setProcessingProgress(Math.round(((i + 1) / total) * 100));
    }

    // Log the event and upload file
    let fileUrl = '';
    if (fileObject) {
      const filePath = `${selectedSupplierId}/${Date.now()}_${fileName}`;
      const { data: uploadData } = await supabase.storage
        .from('supplier-price-lists')
        .upload(filePath, fileObject);

      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from('supplier-price-lists')
          .getPublicUrl(filePath);
        fileUrl = publicUrl;
      }
    }

    await supabase.from('supplier_price_list_history').insert({
      supplier_id: selectedSupplierId,
      file_name: fileName,
      file_url: fileUrl,
      total_items: total,
      increased_prices: previewItems.filter(it => it.status === 'increase').length,
      decreased_prices: previewItems.filter(it => it.status === 'decrease').length,
      new_items: created,
    });

    setStats({ updated, created, errors, oos });
    setPhase('done');
    onComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-6xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="mb-6 flex justify-between items-start flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">Import Supplier Price List</h2>
            <p className="text-sm text-slate-400 mt-1">Detect price changes and update procurement costs from Excel/CSV</p>
          </div>
          <div className="flex items-center gap-4">
             {selectedSupplierId && (
                <div className="px-4 py-2 bg-slate-800 rounded-xl border border-slate-700">
                   <p className="text-[10px] text-slate-500 uppercase font-black">Selected Supplier</p>
                   <p className="text-xs font-bold text-emerald-400">{suppliers.find(s => s.id === selectedSupplierId)?.name}</p>
                </div>
             )}
             <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Phase 1: Upload */}
          {phase === 'upload' && (
            <div className="space-y-6 py-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Select Supplier</label>
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none"
                >
                  <option value="">Choose a supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {validationError && (
                 <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                       <p className="text-rose-400 font-bold text-sm">Validation Error</p>
                       <p className="text-rose-300/70 text-xs">{validationError}</p>
                    </div>
                    <button onClick={() => setValidationError(null)} className="ml-auto text-rose-400 hover:text-white">✕</button>
                 </div>
              )}

              <div
                onClick={() => !(!selectedSupplierId) && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all ${
                  !selectedSupplierId
                    ? 'border-slate-800 bg-slate-900/50 cursor-not-allowed grayscale'
                    : 'border-slate-700 cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5'
                }`}
              >
                <span className="text-5xl mb-4 block">📊</span>
                <p className="text-lg font-bold text-white">Click to upload Price List</p>
                <p className="text-sm text-slate-500 mt-2">Supports .xlsx, .xls and .csv files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  className="hidden"
                  disabled={!selectedSupplierId}
                />
              </div>

              <div className="flex justify-center">
                 <button
                   onClick={downloadTemplate}
                   className="text-cyan-400 hover:text-cyan-300 text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-colors"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Excel Template
                 </button>
              </div>
            </div>
          )}

          {/* Phase 2: Mapping */}
          {phase === 'mapping' && (
            <div className="space-y-6 py-4">
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                   <p className="text-sm text-slate-300 font-bold flex items-center gap-2">
                     <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">1</span>
                     Excel Structure & Mapping
                   </p>
                   <div className="flex gap-4">
                      <div className="flex flex-col">
                         <label className="text-[10px] font-black text-slate-500 uppercase mb-1">Sheet Name</label>
                         <input
                            type="text"
                            value={sheetName}
                            onChange={e => setSheetName(e.target.value)}
                            placeholder="Sheet1"
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white w-40"
                         />
                      </div>
                      <div className="flex flex-col">
                         <label className="text-[10px] font-black text-slate-500 uppercase mb-1">Header Row</label>
                         <input
                            type="number"
                            value={headerRow}
                            onChange={e => setHeaderRow(parseInt(e.target.value) || 1)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white w-20"
                         />
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { key: 'supplier_sku', label: 'Supplier Code', req: false },
                    { key: 'name', label: 'Description', req: true },
                    { key: 'price', label: 'Base Price', req: false },
                    { key: 'case_price', label: 'Case Price', req: false },
                    { key: 'unit_price', label: 'Unit Price', req: false },
                    { key: 'barcode', label: 'Barcode', req: false },
                    { key: 'brand', label: 'Brand', req: false },
                    { key: 'product_type', label: 'Type', req: false },
                    { key: 'pack_size', label: 'Pack Size', req: false },
                    { key: 'case_quantity', label: 'Case Qty', req: false },
                    { key: 'vat_rate', label: 'VAT %', req: false },
                    { key: 'supplier_comment', label: 'Comment', req: false },
                  ].map(field => (
                    <div key={field.key}>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">{field.label} {field.req && '*'}</label>
                      <select
                        value={mapping[field.key]}
                        onChange={e => setMapping({ ...mapping, [field.key]: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      >
                        <option value="">(Ignore)</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 flex items-center justify-between">
                    <div>
                       <p className="text-sm text-white font-bold">Detect Out of Stock by Color</p>
                       <p className="text-xs text-slate-500">Automatically deactivate items highlighted in <span className="text-rose-400 font-bold underline">Red</span>.</p>
                    </div>
                    <button
                       type="button"
                       onClick={() => setDetectOosByColor(!detectOosByColor)}
                       className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                         detectOosByColor ? 'bg-rose-600' : 'bg-slate-700'
                       }`}
                     >
                       <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                         detectOosByColor ? 'translate-x-6' : 'translate-x-1'
                       }`} />
                     </button>
                 </div>

                 <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 flex items-center justify-between">
                    <div>
                       <p className="text-sm text-white font-bold">Extract Pack Info from Name</p>
                       <p className="text-xs text-slate-500">Auto-parse formats like <span className="text-emerald-400 font-mono">24X400 GM</span>.</p>
                    </div>
                    <button
                       type="button"
                       onClick={() => setSpecialRules({ ...specialRules, extract_pack_info: !specialRules.extract_pack_info })}
                       className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                         specialRules.extract_pack_info ? 'bg-emerald-600' : 'bg-slate-700'
                       }`}
                     >
                       <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                         specialRules.extract_pack_info ? 'translate-x-6' : 'translate-x-1'
                       }`} />
                     </button>
                 </div>
              </div>

              <button
                onClick={() => startAnalysis()}
                disabled={!mapping.name || (!mapping.price && !mapping.case_price && !mapping.unit_price) || !selectedSupplierId}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-900/20"
              >
                Analyze Price Changes →
              </button>
            </div>
          )}

          {/* Phase 3: Preview */}
          {phase === 'preview' && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between mb-2">
                 <h3 className="text-sm font-bold text-slate-200">Analysis Results: {previewItems.length} Items</h3>
                 <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded border border-rose-500/20">Increases: {previewItems.filter(it => it.status === 'increase').length}</span>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20">Decreases: {previewItems.filter(it => it.status === 'decrease').length}</span>
                    <span className="px-2 py-0.5 bg-rose-600/20 text-rose-300 text-[10px] font-bold rounded border border-rose-500/30">OOS: {previewItems.filter(it => it.status === 'oos').length}</span>
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20">New: {previewItems.filter(it => it.status === 'new').length}</span>
                 </div>
              </div>

              <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                      <th className="px-4 py-3">Supplier Code / Name</th>
                      <th className="px-4 py-3">Internal Match</th>
                      <th className="px-4 py-3 text-right">Current Cost</th>
                      <th className="px-4 py-3 text-right">New Case/Unit</th>
                      <th className="px-4 py-3 text-center">Pack/Qty</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {previewItems.map((item, idx) => (
                      <tr key={idx} className={`hover:bg-slate-800/40 transition-colors ${item.status === 'increase' ? 'bg-rose-500/5' : item.status === 'decrease' ? 'bg-emerald-500/5' : item.status === 'oos' ? 'bg-rose-900/20 opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <p className={`font-bold ${item.status === 'oos' ? 'text-rose-400' : 'text-slate-200'}`}>{item.supplier_sku || 'No Code'}</p>
                          <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{item.name}</p>
                          {item.supplier_comment && (
                            <p className="text-[9px] text-cyan-500/70 italic mt-0.5">Note: {item.supplier_comment}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.matched_product_id ? (
                            <div>
                               <p className="font-medium text-cyan-400">{item.matched_product_name}</p>
                               <p className="text-[10px] text-slate-500">{item.barcode}</p>
                            </div>
                          ) : (
                            <span className="text-rose-400/50 italic">Unmatched</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500 font-mono">
                          {item.current_price ? formatCurrency(item.current_price) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                           {item.status === 'oos' ? (
                             <span className="text-rose-400 font-black tracking-widest">OOS</span>
                           ) : (
                             <>
                               <div className={`font-bold ${item.status === 'increase' ? 'text-rose-400' : item.status === 'decrease' ? 'text-emerald-400' : 'text-slate-200'}`}>
                                  <p>{formatCurrency(item.price)}</p>
                                  {item.unit_price !== undefined && item.unit_price > 0 && (
                                    <p className="text-[9px] text-slate-500">Unit: {formatCurrency(item.unit_price)}</p>
                                  )}
                               </div>
                               {item.price_diff !== undefined && item.price_diff !== 0 && (
                                 <p className={`text-[9px] font-bold ${item.status === 'increase' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {item.price_diff > 0 ? '+' : ''}{formatCurrency(item.price_diff)}
                                 </p>
                               )}
                             </>
                           )}
                        </td>
                        <td className="px-4 py-3 text-center">
                           <p className="font-bold text-slate-400">{item.case_quantity} x {item.pack_size}</p>
                           <p className="text-[9px] text-slate-500 uppercase">{item.unit_of_measure || 'Units'}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                           <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border ${
                             item.status === 'increase' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                             item.status === 'decrease' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                             item.status === 'oos' ? 'bg-rose-600 text-white border-rose-700' :
                             item.status === 'new' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                             'bg-slate-700/50 text-slate-500 border-slate-700'
                           }`}>
                             {item.status === 'oos' ? 'OUT OF STOCK' : item.status}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Phase 4: Processing */}
          {phase === 'processing' && (
            <div className="py-20 text-center space-y-6">
               <div className="inline-block w-16 h-16 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
               <div>
                  <h3 className="text-xl font-bold text-white">Applying Price Updates...</h3>
                  <p className="text-slate-500 mt-1">Please do not close this window</p>
               </div>
               <div className="max-w-md mx-auto">
                  <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                    <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${processingProgress}%` }}></div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 font-mono">{processingProgress}% Complete</p>
               </div>
            </div>
          )}

          {/* Phase 5: Done */}
          {phase === 'done' && (
             <div className="py-12 text-center space-y-8">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                   <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                   <h3 className="text-2xl font-black text-white uppercase tracking-tight">Import Completed</h3>
                   <p className="text-slate-500 mt-1">The supplier price list has been successfully processed.</p>
                </div>

                <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                   <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                      <p className="text-3xl font-black text-emerald-400">{stats.updated}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Updated</p>
                   </div>
                   <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                      <p className="text-3xl font-black text-blue-400">{stats.created}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">New Links</p>
                   </div>
                   <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                      <p className="text-3xl font-black text-rose-400">{stats.errors}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Errors</p>
                   </div>
                </div>

                <button onClick={onClose} className="px-12 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all">Dismiss</button>
             </div>
          )}
        </div>

        {/* Footer actions for Preview */}
        {phase === 'preview' && (
          <div className="mt-6 pt-6 border-t border-slate-800 flex gap-3 flex-shrink-0">
             <button onClick={() => setPhase('mapping')} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold uppercase tracking-widest transition-all">Back to Mapping</button>
             <button onClick={applyImport} className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-900/20">Apply {previewItems.length} Changes</button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Button,
  designTokens,
  getInputClasses,
  SectionHeader
} from '@/lib/design-system';
import { AuditService, AuditProduct, ExpiryBatch, FullAuditSession, RecentAuditItem } from '@/lib/services/inventory/auditService';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

// Simple SVG Icons to replace lucide-react for better reliability
const Icons = {
  Search: () => <span className="text-lg">🔍</span>,
  Barcode: ({ size = 24 }: { size?: number }) => <span style={{ fontSize: size }}>🏷️</span>,
  CheckCircle2: ({ size = 20 }: { size?: number }) => <span style={{ fontSize: size }}>✅</span>,
  AlertCircle: ({ size = 20, className = "" }: { size?: number, className?: string }) => <span style={{ fontSize: size }} className={className}>⚠️</span>,
  Plus: ({ size = 18 }: { size?: number }) => <span style={{ fontSize: size }}>➕</span>,
  Trash: ({ size = 16 }: { size?: number }) => <span style={{ fontSize: size }}>🗑️</span>,
  Mic: ({ size = 18, className = "" }: { size?: number, className?: string }) => <span style={{ fontSize: size }} className={className}>🎤</span>,
  History: ({ size = 16 }: { size?: number }) => <span style={{ fontSize: size }}>🕒</span>,
  Package: ({ size = 40 }: { size?: number }) => <span style={{ fontSize: size }}>📦</span>,
  X: () => <span>✕</span>
};

type AuditStep = 'scan' | 'select-product' | 'audit-form' | 'create-new' | 'summary';
type Tab = 'audit' | 'idle' | 'newly-found';

const formatProductSize = (product: {
  weight?: number | null;
  weight_kg?: number | null;
  weight_grams?: number | null;
  unit?: string | null;
  pack_size?: number | null;
  pack_unit?: string | null;
}) => {
  if (product.weight_grams != null && product.weight_grams > 0) {
    return product.weight_grams >= 1000 && product.weight_grams % 1000 === 0
      ? `${product.weight_grams / 1000} kg`
      : `${product.weight_grams} g`;
  }
  if (product.weight_kg != null && product.weight_kg > 0) {
    return product.weight_kg < 1
      ? `${Math.round(product.weight_kg * 1000)} g`
      : `${product.weight_kg} kg`;
  }
  if (product.weight != null && product.weight > 0 && product.unit) {
    const unit = product.unit.toLowerCase();
    // Some older imports stored kilogram-decimal weight while retaining unit='g'
    // (for example 0.14 + g means 140 g). Normalize only that legacy shape.
    if (unit === 'g' && product.weight < 1) return `${Math.round(product.weight * 1000)} g`;
    return `${product.weight} ${product.unit}`;
  }
  if (product.pack_size != null && product.pack_unit) return `${product.pack_size} ${product.pack_unit}`;
  return '';
};

const measurementLabel = (product: AuditProduct | null) => {
  if (!product) return '';
  return formatProductSize(product);
};

const productDisplayName = (product: AuditProduct | null) => {
  if (!product) return '';
  const measure = measurementLabel(product);
  return measure ? `${product.name} · ${measure}` : product.name;
};

export default function InventoryAuditPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('audit');
  const [step, setStep] = useState<AuditStep>('scan');
  const [scannedGtin, setScannedGtin] = useState('');
  const [currentProduct, setCurrentProduct] = useState<AuditProduct | null>(null);
  const [searchResults, setSearchResults] = useState<AuditProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Audit Form State
  const [bins, setBins] = useState<{ location_code: string; stock_quantity: string }[]>([]);
  const [expiryBatches, setExpiryBatches] = useState<ExpiryBatch[]>([]);
  const [unitsPerBox, setUnitsPerBox] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [isListening, setIsListening] = useState(false);

  const productSizeLabel = (product: AuditProduct | null) => {
    if (!product) return '';
    return formatProductSize(product) || product.unit || '';
  };

  // Lists
  const [unauditedProducts, setUnauditedProducts] = useState<AuditProduct[]>([]);
  const [newlyAddedProducts, setNewlyAddedProducts] = useState<AuditProduct[]>([]);
  const [recentAudits, setRecentAudits] = useState<RecentAuditItem[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [fullAuditSession, setFullAuditSession] = useState<FullAuditSession | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  // Audit Status Notification - using auditStatus consistently
  const [auditStatus, setAuditStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Voice Search Handler
  const startVoiceSearch = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Voice recognition not supported in this browser.");
      return;
    }

    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      performSearch(transcript);
    };

    recognition.start();
  };

  // Focus scan input on mount and after actions
  useEffect(() => {
    if (step === 'scan' && activeTab === 'audit') {
      scanInputRef.current?.focus();
    }
  }, [step, activeTab]);

  const loadUnaudited = useCallback(async () => {
    const data = await AuditService.getUnauditedProducts(7); // Audited more than 7 days ago
    setUnauditedProducts(data);
  }, []);

  const loadFullAuditSession = useCallback(async () => {
    const session = await AuditService.getOpenFullAuditSession();
    setFullAuditSession(session);
  }, []);

  const loadRecentAudits = useCallback(async () => {
    const items = await AuditService.getRecentAuditItems(2);
    setRecentAudits(items);
  }, []);

  useEffect(() => {
    loadUnaudited();
    loadFullAuditSession();
    loadRecentAudits();
  }, [loadUnaudited, loadFullAuditSession, loadRecentAudits]);

  const handleStartFullAudit = async () => {
    setSessionBusy(true);
    const session = await AuditService.startFullAudit('Full physical stock audit');
    setSessionBusy(false);
    if (!session) {
      setAuditStatus({ type: 'error', text: 'Could not start the full stock audit session.' });
      return;
    }
    setFullAuditSession(session);
    setAuditStatus({
      type: 'success',
      text: `Full audit started. ${session.snapshot_product_count} products with system stock are waiting to be physically counted.`,
    });
  };

  const handleFinalizeFullAudit = async () => {
    if (!fullAuditSession) return;
    const confirmed = window.confirm(
      'Finalize this full stock audit? Any product with positive system stock that was not counted will be set to zero, unpublished and held for confirmation.'
    );
    if (!confirmed) return;

    setSessionBusy(true);
    const missingCount = await AuditService.finalizeFullAudit(fullAuditSession.id);
    setSessionBusy(false);
    if (missingCount === null) {
      setAuditStatus({ type: 'error', text: 'Could not finalize the full stock audit.' });
      return;
    }

    setFullAuditSession(null);
    setAuditStatus({
      type: 'success',
      text: `Audit finalized. ${missingCount} uncounted product${missingCount === 1 ? '' : 's'} moved to zero stock and unpublished pending confirmation.`,
    });
    loadUnaudited();
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedGtin) return;

    setIsLoading(true);
    const product = await AuditService.findProductByGTIN(scannedGtin);
    setIsLoading(false);

    if (product) {
      handleProductSelect(product);
    } else {
      setStep('select-product');
      setSearchQuery('');
    }
  };

  const handleProductSelect = async (product: AuditProduct) => {
    setCurrentProduct(product);

    // Blind audit rule: the counting form must start from a clean physical observation.
    // Do not prefill the system stock, saved location, saved bin quantities or expiry-box quantities.
    setBins([{ location_code: '', stock_quantity: '' }]);
    setExpiryBatches([]);

    // Packaging metadata is not a stock answer, so pieces-per-box may be reused as a convenience.
    setUnitsPerBox(product.units_per_box ? String(product.units_per_box) : '');
    setNotes('');
    setStep('audit-form');
  };

  const performSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await AuditService.searchProductsByName(query);
    setSearchResults(results);
    setIsSearching(false);
  };

  const addBin = () => {
    setBins([...bins, { location_code: '', stock_quantity: '' }]);
  };

  const removeBin = (index: number) => {
    setBins(bins.filter((_, i) => i !== index));
  };

  const updateBin = (index: number, field: 'location_code' | 'stock_quantity', value: string) => {
    const newBins = [...bins];
    newBins[index][field] = value;
    setBins(newBins);
  };

  const addExpiryBatch = () => {
    setExpiryBatches([...expiryBatches, {
      batch_id: null,
      expiry_date: '',
      quantity: 0,
      remaining_quantity: 0,
      box_number: expiryBatches.length + 1,
    }]);
  };

  const splitStockIntoBoxes = () => {
    const boxSize = Math.max(0, parseInt(unitsPerBox, 10) || 0);
    const totalStock = bins.reduce((sum, bin) => sum + (parseInt(bin.stock_quantity, 10) || 0), 0);
    if (boxSize <= 0) {
      setAuditStatus({ type: 'error', text: 'Enter Pieces per box first.' });
      return;
    }
    if (totalStock <= 0) {
      setAuditStatus({ type: 'error', text: 'Enter the physical stock quantity first.' });
      return;
    }

    const fallbackExpiry = expiryBatches.find(batch => batch.expiry_date)?.expiry_date || '';
    const fallbackLot = expiryBatches.find(batch => batch.batch_id)?.batch_id || null;
    const rows: ExpiryBatch[] = [];
    let remaining = totalStock;
    let boxNo = 1;

    while (remaining > 0) {
      const qty = Math.min(boxSize, remaining);
      rows.push({
        batch_id: fallbackLot,
        expiry_date: fallbackExpiry,
        quantity: qty,
        remaining_quantity: qty,
        box_number: boxNo,
      });
      remaining -= qty;
      boxNo += 1;
    }

    setExpiryBatches(rows);
    setAuditStatus({
      type: 'success',
      text: `Split ${totalStock} pieces into ${rows.length} box${rows.length === 1 ? '' : 'es'} of up to ${boxSize} pieces.`,
    });
  };

  const removeExpiryBatch = (index: number) => {
    setExpiryBatches(expiryBatches.filter((_, i) => i !== index));
  };

  const updateExpiryBatch = (index: number, field: 'batch_id' | 'expiry_date' | 'quantity', value: string) => {
    const next = [...expiryBatches];
    if (field === 'quantity') {
      next[index] = { ...next[index], quantity: Math.max(0, parseInt(value, 10) || 0) };
    } else {
      next[index] = { ...next[index], [field]: value || (field === 'batch_id' ? null : '') } as ExpiryBatch;
    }
    setExpiryBatches(next);
  };

  const handleAuditSubmit = async () => {
    if (!currentProduct) return;

    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const formattedBins = bins.map(b => ({
      location_code: b.location_code,
      stock_quantity: parseInt(b.stock_quantity) || 0
    }));

    const totalStock = formattedBins.reduce((sum, b) => sum + b.stock_quantity, 0);
    const expiryTotal = expiryBatches.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity) || 0), 0);
    const nonZeroExpiryBatches = expiryBatches.filter(batch => Math.max(0, Number(batch.quantity) || 0) > 0);

    if (nonZeroExpiryBatches.some(batch => !batch.expiry_date)) {
      setAuditStatus({ type: 'error', text: 'Every expiry batch with stock needs an expiry date.' });
      setIsLoading(false);
      return;
    }

    if (nonZeroExpiryBatches.length > 0 && expiryTotal !== totalStock) {
      setAuditStatus({ type: 'error', text: `Expiry batch total (${expiryTotal}) must match audited stock total (${totalStock}).` });
      setIsLoading(false);
      return;
    }

    const success = await AuditService.performAudit({
      productId: currentProduct.id,
      totalStock: totalStock,
      bins: formattedBins,
      expiryBatches,
      unitsPerBox: unitsPerBox ? Math.max(1, parseInt(unitsPerBox, 10) || 1) : null,
      notes: notes,
      userId: user?.id,
      gtin: scannedGtin // Update GTIN if it was scanned and assigned
    });

    setIsLoading(false);

    if (success) {
      setAuditStatus({ type: 'success', text: `Audited ${productDisplayName(currentProduct)} across ${bins.length} locations.` });
      resetAudit();
      loadUnaudited();
      loadFullAuditSession();
      loadRecentAudits();
    } else {
      setAuditStatus({ type: 'error', text: 'Failed to save audit data.' });
    }
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.target as any).name.value;
    if (!name) return;

    setIsLoading(true);
    const product = await AuditService.quickCreateProduct(name, scannedGtin);
    setIsLoading(false);

    if (product) {
      setNewlyAddedProducts(prev => [product, ...prev]);
      handleProductSelect(product);
    } else {
      setAuditStatus({ type: 'error', text: 'Failed to create product.' });
    }
  };

  const resetAudit = () => {
    setStep('scan');
    setScannedGtin('');
    setCurrentProduct(null);
    setBins([]);
    setExpiryBatches([]);
    setUnitsPerBox('');
    setNotes('');
    setSearchResults([]);
  };

  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="📋"
          title="Inventory Audit"
          subtitle="Physical stock verification & location tracking"
          action={
            <Link href="/inventory-management/reports/audit">
              <Button variant="secondary">
                <span className="mr-2">📊</span> View Audit Report
              </Button>
            </Link>
          }
        />

        <Card variant="glass" className="mb-6 border-cyan-500/20">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-black text-cyan-400">Full Stock Audit Session</p>
                {fullAuditSession ? (
                  <>
                    <p className="text-sm font-bold text-slate-100 mt-1">Audit is open — scan/count the full physical stock before finalising.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Started {new Date(fullAuditSession.started_at).toLocaleString('en-GB')} ·
                      Snapshot {fullAuditSession.snapshot_product_count} ·
                      Counted {fullAuditSession.counted_product_count}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-100 mt-1">No full audit is currently open.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Start a full audit before stock counting if you want uncounted system stock to be automatically quarantined at the end.
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {fullAuditSession ? (
                  <>
                    <Link
                      href="/inventory-management/reports/audit"
                      className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black uppercase text-slate-200"
                    >
                      Review Report
                    </Link>
                    <button
                      type="button"
                      onClick={handleFinalizeFullAudit}
                      disabled={sessionBusy}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black uppercase disabled:opacity-50"
                    >
                      {sessionBusy ? 'Finalising…' : 'Finalize Full Audit'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartFullAudit}
                    disabled={sessionBusy}
                    className="px-4 py-2.5 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase disabled:opacity-50"
                  >
                    {sessionBusy ? 'Starting…' : 'Start Full Audit'}
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-slate-900/40 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'audit', label: 'Start Audit', icon: Icons.Barcode },
            { id: 'idle', label: 'Idle Products', icon: Icons.History },
            { id: 'newly-found', label: 'New Finds', icon: Icons.Plus },
          ].map(({ icon: TabIcon, ...tab }) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <TabIcon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {auditStatus && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 border ${
            auditStatus.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            {auditStatus.type === 'success' ? <Icons.CheckCircle2 size={20} /> : <Icons.AlertCircle size={20} />}
            <span className="text-sm font-medium">{auditStatus.text}</span>
            <button onClick={() => setAuditStatus(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <div className={designTokens.spacing.section}>

          {activeTab === 'audit' && (
            <div className="space-y-6">

              {/* Recent audited products — persisted from audit logs so progress survives navigation/reload */}
              {step === 'scan' && recentAudits.length > 0 && (
                <Card variant="glass" className="border-blue-500/20">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[10px] text-blue-400 uppercase font-black tracking-[0.18em]">Where you stopped</p>
                        <p className="text-xs text-slate-500 mt-1">Last two completed stock-audit scans</p>
                      </div>
                      <Icons.History size={18} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {recentAudits.map((item, index) => {
                        const size = formatProductSize(item) || item.unit || '—';

                        return (
                          <div
                            key={item.log_id}
                            className={`rounded-2xl border p-3.5 ${
                              index === 0
                                ? 'border-cyan-500/30 bg-cyan-500/5'
                                : 'border-slate-800 bg-slate-900/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                  {index === 0 ? 'Last scanned' : 'Previous'}
                                </p>
                                <p className="font-black text-slate-100 mt-1 truncate">{item.name}</p>
                                <p className="text-xs text-cyan-300 font-bold mt-0.5">{size}</p>
                              </div>
                              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                {new Date(item.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-3 py-2">
                                <p className="text-[9px] uppercase font-black text-slate-600">Qty</p>
                                <p className="text-lg font-black text-white">{item.quantity}</p>
                              </div>
                              <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-3 py-2">
                                <p className="text-[9px] uppercase font-black text-slate-600">Location</p>
                                <p className="text-sm font-black text-white truncate">{item.warehouse_location || 'Unassigned'}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 1: Scan Barcode */}
              {step === 'scan' && (
                <Card>
                  <CardContent className="py-12">
                    <div className="max-w-md mx-auto text-center">
                      <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
                        <Icons.Barcode size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Scan Product Barcode</h3>
                      <p className="text-slate-400 mb-8">Scan the barcode to identify the product. Existing system stock and location stay hidden while you count.</p>

                      <div className="space-y-4">
                        <button
                          onClick={() => setShowScanner(true)}
                          className="w-full py-6 bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-3xl font-black text-lg uppercase tracking-widest shadow-xl shadow-cyan-900/20 active:scale-[0.98] transition-all flex flex-col items-center gap-2"
                        >
                          <span className="text-3xl">📷</span>
                          Open Camera Scanner
                        </button>

                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-slate-800"></div>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">or enter manually</span>
                          <div className="h-px flex-1 bg-slate-800"></div>
                        </div>

                        <form onSubmit={handleScan} className="relative">
                          <input
                            ref={scanInputRef}
                            type="text"
                            placeholder="Type barcode ID..."
                            value={scannedGtin}
                            onChange={(e) => setScannedGtin(e.target.value)}
                            className={`w-full text-center text-xl font-mono tracking-widest py-4 ${getInputClasses()}`}
                          />
                          {isLoading && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          <Button type="submit" variant="primary" className="w-full mt-4" disabled={!scannedGtin || isLoading}>
                            Lookup Product
                          </Button>
                        </form>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Product Not Found - Select or Create */}
              {step === 'select-product' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icons.AlertCircle className="text-amber-500" />
                      GTIN Not Found: {scannedGtin}
                    </CardTitle>
                    <CardDescription>
                      Assign this barcode to an existing product or create a new entry.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Icons.Search />
                        </div>
                        <input
                          type="text"
                          placeholder="Search product name, brand or category..."
                          className={`w-full pl-10 pr-12 ${getInputClasses()}`}
                          value={searchQuery}
                          onChange={(e) => performSearch(e.target.value)}
                        />
                        <button
                          onClick={startVoiceSearch}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-slate-800 text-slate-400'}`}
                        >
                          <Icons.Mic size={20} />
                        </button>
                      </div>

                      {isSearching ? (
                         <div className="py-12 text-center">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-slate-400">Searching catalog...</p>
                         </div>
                      ) : searchResults.length > 0 ? (
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                          {searchResults.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleProductSelect(p)}
                              className="w-full flex items-center justify-between p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800 hover:border-blue-500/50 transition-all text-left group"
                            >
                              <div className="min-w-0">
                                <p className="text-slate-200 font-medium truncate">{productDisplayName(p)}</p>
                                <p className="text-xs text-slate-500">{p.brand || 'No Brand'} · {p.category || 'No Category'}</p>
                              </div>
                              <Icons.Plus />
                            </button>
                          ))}
                        </div>
                      ) : searchQuery.length >= 2 ? (
                        <div className="py-8 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
                          <p className="text-slate-400">No products match &quot;{searchQuery}&quot;</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="pt-6 border-t border-slate-800">
                      <SectionHeader title="Or Create New Product" subtitle="Add a basic entry now, add more details later" />
                      <form onSubmit={handleQuickCreate} className="mt-4 flex gap-2">
                        <input
                          name="name"
                          type="text"
                          placeholder="Product Name..."
                          className={`flex-1 ${getInputClasses()}`}
                          required
                        />
                        <Button type="submit" variant="secondary" disabled={isLoading}>
                          <Icons.Plus size={18} />
                        </Button>
                      </form>
                    </div>

                    <Button variant="ghost" className="w-full mt-4" onClick={() => setStep('scan')}>
                      Cancel & Scan Again
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Audit Form */}
              {step === 'audit-form' && currentProduct && (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-xl">{productDisplayName(currentProduct)}</CardTitle>
                      <CardDescription>SKU: {currentProduct.sku || 'N/A'} | GTIN: {scannedGtin || currentProduct.gtin}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] font-black text-cyan-300">Blind Count Mode</p>
                      <p className="text-sm text-slate-300 mt-1">
                        System stock, saved locations and existing expiry-box quantities are hidden. Enter only what you physically see now.
                        The saved audit report will compare your count with the previous system values afterwards.
                      </p>
                    </div>

                    {/* Identity only — no system stock/location shown before submission */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Size</p>
                        <p className="text-sm font-bold text-white">{productSizeLabel(currentProduct) || '—'}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Brand</p>
                        <p className="text-sm font-medium text-slate-300 truncate">{currentProduct.brand || '—'}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Category</p>
                        <p className="text-sm font-medium text-slate-300 truncate">{currentProduct.category || '—'}</p>
                      </div>
                    </div>

                    {/* Audit Inputs */}
                    <div className="space-y-6 pt-4">

                      {/* Expiry Tracking */}
                      <div className="space-y-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <label className={designTokens.typography.label}>Expiry Boxes</label>
                              <p className="text-[10px] text-amber-500 font-medium mt-1">
                                One row = one physical box. All pieces inside that box share the same expiry date.
                              </p>
                            </div>
                            <Button variant="secondary" onClick={addExpiryBatch}>
                              <Icons.Plus size={14} /> Add Box
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                            <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
                              <label className="text-[10px] text-slate-500 uppercase font-bold">Pieces per box</label>
                              <input
                                type="number"
                                min={1}
                                value={unitsPerBox}
                                onChange={(e) => setUnitsPerBox(e.target.value)}
                                placeholder="e.g. 25"
                                className={`w-full mt-1 text-sm font-bold ${getInputClasses()}`}
                              />
                              <p className="text-[10px] text-slate-500 mt-1">Saved for this SKU and reused next time.</p>
                            </div>
                            <button
                              type="button"
                              onClick={splitStockIntoBoxes}
                              className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs font-black text-amber-300"
                            >
                              Split stock into boxes
                            </button>
                          </div>
                        </div>

                        {expiryBatches.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-700 p-4 text-xs text-slate-500 text-center">
                            No box entered yet. Add each physical box you actually see if the stock has an expiry date.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {expiryBatches.map((batch, index) => (
                              <div key={batch.id || index} className="grid grid-cols-12 gap-2 items-end rounded-xl bg-slate-900/40 border border-slate-800 p-3">
                                <div className="col-span-12 flex items-center justify-between">
                                  <span className="text-[10px] uppercase tracking-widest font-black text-amber-300">
                                    Box {batch.box_number || index + 1}
                                  </span>
                                  {unitsPerBox && Number(batch.quantity) < Number(unitsPerBox) && (
                                    <span className="text-[10px] font-bold text-slate-500">Partial box</span>
                                  )}
                                </div>
                                <div className="col-span-12 sm:col-span-4 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Lot / batch code (optional)</label>
                                  <input
                                    type="text"
                                    value={batch.batch_id || ''}
                                    onChange={(e) => updateExpiryBatch(index, 'batch_id', e.target.value)}
                                    placeholder="Supplier lot code"
                                    className={`w-full text-sm ${getInputClasses()}`}
                                  />
                                </div>
                                <div className="col-span-7 sm:col-span-5 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Expiry Date</label>
                                  <input
                                    type="date"
                                    value={batch.expiry_date || ''}
                                    onChange={(e) => updateExpiryBatch(index, 'expiry_date', e.target.value)}
                                    className={`w-full text-sm ${getInputClasses()}`}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-2 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Pieces in box</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={batch.quantity}
                                    onChange={(e) => updateExpiryBatch(index, 'quantity', e.target.value)}
                                    className={`w-full text-sm font-bold ${getInputClasses()}`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeExpiryBatch(index)}
                                  className="col-span-1 p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                  aria-label={`Remove expiry batch ${index + 1}`}
                                >
                                  <Icons.Trash size={18} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between rounded-xl bg-slate-900/40 border border-slate-800 px-3 py-2">
                          <span className="text-xs text-slate-500">
                            {expiryBatches.length} box{expiryBatches.length === 1 ? '' : 'es'} · total pieces
                          </span>
                          <span className="font-black text-amber-300">
                            {expiryBatches.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity) || 0), 0)}
                          </span>
                        </div>
                      </div>

                      {/* Multi-Location Bins */}
                      <div className="space-y-4">
                        <SectionHeader
                          title="Stock by Location"
                          subtitle="Enter the physical location(s) you actually find — saved locations are intentionally hidden"
                          action={
                            <Button variant="secondary" onClick={addBin}>
                              <Icons.Plus size={14} /> Add Bin
                            </Button>
                          }
                        />

                        <div className="space-y-3">
                          {bins.map((bin, index) => (
                            <div key={index} className="flex gap-2 items-end bg-slate-900/30 p-3 rounded-xl border border-slate-800">
                              <div className="flex-1 space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Location / Bin</label>
                                <input
                                  type="text"
                                  value={bin.location_code}
                                  onChange={(e) => updateBin(index, 'location_code', e.target.value)}
                                  placeholder="e.g. A1-B2"
                                  className={`w-full text-sm ${getInputClasses()}`}
                                />
                              </div>
                              <div className="w-24 space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Stock</label>
                                <input
                                  type="number"
                                  value={bin.stock_quantity}
                                  onChange={(e) => updateBin(index, 'stock_quantity', e.target.value)}
                                  className={`w-full text-sm font-bold ${getInputClasses()}`}
                                />
                              </div>
                              {bins.length > 1 && (
                                <button
                                  onClick={() => removeBin(index)}
                                  className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                >
                                  <Icons.Trash size={18} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                          <span className="text-sm text-slate-400 font-medium">Physical Count Entered:</span>
                          <span className="text-xl font-bold text-blue-400">
                            {bins.reduce((sum, b) => sum + (parseInt(b.stock_quantity) || 0), 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={designTokens.typography.label}>Audit Notes (Optional)</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={`w-full h-20 ${getInputClasses()}`}
                        placeholder="Any discrepancies or condition notes..."
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-6">
                      <Button variant="primary" className="flex-1 py-4 text-lg" onClick={handleAuditSubmit} disabled={isLoading}>
                        {isLoading ? 'Saving...' : 'Save Audit & Complete'}
                      </Button>
                      <Button variant="secondary" className="px-8" onClick={resetAudit} disabled={isLoading}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          )}

          {activeTab === 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle>Idle Products</CardTitle>
                <CardDescription>Active products that haven&apos;t been audited in the last 7 days.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {unauditedProducts.length > 0 ? (
                    unauditedProducts.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-800/20 border border-slate-700/50">
                        <div>
                          <p className="text-slate-200 font-medium">{productDisplayName(p)}</p>
                          <p className="text-xs text-slate-500">Blind audit ready · system stock and location hidden</p>
                        </div>
                        <Button variant="secondary" onClick={() => {
                          setActiveTab('audit');
                          handleProductSelect(p);
                        }}>
                          Audit Now
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <div className="text-4xl mb-4 opacity-50">✨</div>
                      <p className="text-slate-400">All active products have been audited recently!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'newly-found' && (
            <Card>
              <CardHeader>
                <CardTitle>Newly Found Products</CardTitle>
                <CardDescription>Products added to the catalog during this audit session.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {newlyAddedProducts.length > 0 ? (
                    newlyAddedProducts.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                        <div>
                          <p className="text-slate-200 font-medium">{p.name}</p>
                          <p className="text-xs text-slate-500">GTIN: {p.gtin} | Added Today</p>
                        </div>
                        <Button variant="secondary" onClick={() => {
                          setActiveTab('audit');
                          handleProductSelect(p);
                        }}>
                          Update Details
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <div className="text-4xl mb-4 opacity-30">📦</div>
                      <p className="text-slate-400">No new products added in this session.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(decodedText) => {
            setScannedGtin(decodedText);
            setShowScanner(false);
            // Manually trigger lookup logic
            setIsLoading(true);
            AuditService.findProductByGTIN(decodedText).then(product => {
              setIsLoading(false);
              if (product) {
                handleProductSelect(product);
              } else {
                setStep('select-product');
                setSearchQuery('');
              }
            });
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

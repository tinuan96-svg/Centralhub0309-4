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
  Badge,
  designTokens,
  getInputClasses,
  SectionHeader
} from '@/lib/design-system';
import { AuditService, AuditProduct } from '@/lib/services/inventory/auditService';
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
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [isListening, setIsListening] = useState(false);

  // Lists
  const [unauditedProducts, setUnauditedProducts] = useState<AuditProduct[]>([]);
  const [newlyAddedProducts, setNewlyAddedProducts] = useState<AuditProduct[]>([]);
  const [lastAuditedProduct, setLastAuditedProduct] = useState<AuditProduct | null>(null);

  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    loadUnaudited();
  }, [loadUnaudited]);

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
    setIsLoading(true);
    const productBins = await AuditService.getBinLocations(product.id);
    setIsLoading(false);

    if (productBins.length > 0) {
      setBins(productBins.map(b => ({
        location_code: b.location_code,
        stock_quantity: b.stock_quantity.toString()
      })));
    } else {
      // Default to one bin if none exist
      setBins([{
        location_code: product.warehouse_location || '',
        stock_quantity: product.current_stock.toString()
      }]);
    }

    setExpiryDate(product.expiry_date || '');
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
    setBins([...bins, { location_code: '', stock_quantity: '0' }]);
  };

  const removeBin = (index: number) => {
    setBins(bins.filter((_, i) => i !== index));
  };

  const updateBin = (index: number, field: 'location_code' | 'stock_quantity', value: string) => {
    const newBins = [...bins];
    newBins[index][field] = value;
    setBins(newBins);
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

    const success = await AuditService.performAudit({
      productId: currentProduct.id,
      totalStock: totalStock,
      bins: formattedBins,
      expiryDate: expiryDate || null,
      notes: notes,
      userId: user?.id,
      gtin: scannedGtin // Update GTIN if it was scanned and assigned
    });

    setIsLoading(false);

    if (success) {
      setLastAuditedProduct({
        ...currentProduct,
        current_stock: totalStock,
        warehouse_location: formattedBins[0]?.location_code || '',
        gtin: scannedGtin || currentProduct.gtin
      });
      setAuditStatus({ type: 'success', text: `Audited ${currentProduct.name} across ${bins.length} locations.` });
      resetAudit();
      loadUnaudited();
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
    setExpiryDate('');
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

              {/* Last Audited Quick View */}
              {lastAuditedProduct && step === 'scan' && (
                <Card variant="glass" className="border-blue-500/20">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                      <Icons.CheckCircle2 size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Last Audited</p>
                      <p className="text-sm text-slate-200 font-medium">{lastAuditedProduct.name}</p>
                      <p className="text-xs text-slate-400">Stock: {lastAuditedProduct.current_stock} | Loc: {lastAuditedProduct.warehouse_location || 'None'}</p>
                    </div>
                    <Button variant="ghost" className="ml-auto" onClick={() => setLastAuditedProduct(null)}>Dismiss</Button>
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
                      <p className="text-slate-400 mb-8">Scan the physical barcode to identify the product and verify its stock level.</p>

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
                                <p className="text-slate-200 font-medium truncate">{p.name}</p>
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
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl">{currentProduct.name}</CardTitle>
                        <CardDescription>SKU: {currentProduct.sku || 'N/A'} | GTIN: {scannedGtin || currentProduct.gtin}</CardDescription>
                      </div>
                      <Badge variant={currentProduct.is_active ? 'success' : 'danger'}>
                        {currentProduct.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Current Stock</p>
                        <p className="text-lg font-bold text-white">{currentProduct.current_stock}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Brand</p>
                        <p className="text-sm font-medium text-slate-300 truncate">{currentProduct.brand || '—'}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Category</p>
                        <p className="text-sm font-medium text-slate-300 truncate">{currentProduct.category || '—'}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Published</p>
                        <Badge variant={currentProduct.is_published ? 'info' : 'warning'} className="mt-1">
                          {currentProduct.is_published ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                    </div>

                    {/* Audit Inputs */}
                    <div className="space-y-6 pt-4">

                      {/* Expiry Tracking */}
                      <div className="space-y-2 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <label className={designTokens.typography.label}>Product Expiry Date</label>
                        <input
                          type="date"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                          className={`w-full ${getInputClasses()}`}
                        />
                        <p className="text-[10px] text-amber-500 font-medium">Important for fresh and pantry items.</p>
                      </div>

                      {/* Multi-Location Bins */}
                      <div className="space-y-4">
                        <SectionHeader
                          title="Stock by Location"
                          subtitle="Add multiple bins if stock is split"
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
                          <span className="text-sm text-slate-400 font-medium">Total Calculated Stock:</span>
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
                          <p className="text-slate-200 font-medium">{p.name}</p>
                          <p className="text-xs text-slate-500">Stock: {p.current_stock} | Loc: {p.warehouse_location || 'None'}</p>
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

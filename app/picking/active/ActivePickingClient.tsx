'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PickingService } from '@/lib/services/pickingService';
import { WarehouseService } from '@/lib/services/warehouseService';
import { useVoicePicking } from '@/hooks/useVoicePicking';
import ProductImage from '@/components/ProductImage';
import { OrderWithItems } from '@/lib/types';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

interface GroupedItem {
  product_id: string;
  name: string;
  brand: string | null;
  weight: string | null;
  image: string | null;
  location: string | null;
  gtin: string | null;
  stock: number | null;
  allocations: {
    order_id: string;
    order_number: string;
    quantity: number;
    picked_quantity: number;
  }[];
  total_needed: number;
  total_picked: number;
}

import { PickingAIService } from '@/lib/services/ai/pickingAIService';
import { InventoryService } from '@/lib/services/inventoryService';

export default function ActivePickingClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const searchParams = useSearchParams();
  const idsStr = searchParams.get('ids') || searchParams.get('id') || '';
  const orderIds = useMemo(() => idsStr.split(',').filter(Boolean), [idsStr]);
  const router = useRouter();

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [groupedItems, setGroupedItems] = useState<GroupedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [useAI, setUseAI] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  // Correction features state
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [editingStock, setEditingStock] = useState(false);
  const [stockInput, setStockInput] = useState('');
  const [savingStock, setSavingStock] = useState(false);

  // Offline Persistence for picking progress
  const { state: savedProgress, updateState: saveProgress } = useOfflineQueue<{ index: number; orderIds: string[] }>(
    'active_picking',
    { index: 0, orderIds: [] }
  );

  useEffect(() => {
    if (savedProgress && savedProgress.orderIds.join(',') === idsStr) {
      setCurrentIndex(savedProgress.index);
    }
  }, [savedProgress, idsStr]);

  const updateCurrentIndex = useCallback((index: number) => {
    if (index >= groupedItems.length) {
      setShowSummary(true);
      return;
    }
    setCurrentIndex(index);
    saveProgress({ index, orderIds: orderIds });
  }, [orderIds, saveProgress, groupedItems.length]);

  const [isPaused, setIsPaused] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [startTime] = useState(new Date());

  const currentItem = groupedItems[currentIndex];
  const processingRef = useRef(false);
  const lastActionTimeRef = useRef(0);
  const speakRef = useRef<(text: string) => void>(() => {});

  const completePicking = useCallback(async () => {
    setLoading(true);
    try {
      const durationSeconds = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
      await Promise.all(orderIds.map(id => PickingService.completePicking(id, durationSeconds)));
      const { data: { user } } = await supabase.auth.getUser();
      await Promise.all(orderIds.map(id => WarehouseService.logAction({
        orderId: id,
        action: 'PICKING_COMPLETED',
        userId: user?.id
      })));
      // Clear offline progress on completion
      localStorage.removeItem(`offline_queue_active_picking`);
      router.push('/picking');
    } catch (err) {
      console.error('Complete picking error:', err);
      setLoading(false);
    }
  }, [orderIds, startTime, router]);

  const goToNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < groupedItems.length) {
      updateCurrentIndex(nextIndex);
    } else {
      console.log('[Picking] Last item reached, showing summary');
      setShowSummary(true);
    }
  }, [currentIndex, groupedItems.length, updateCurrentIndex]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      updateCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex, updateCurrentIndex]);

  const handlePicked = useCallback(async () => {
    if (!currentItem || processingRef.current) return;
    processingRef.current = true;

    // 1. Update UI state locally
    const newItems = [...groupedItems];
    newItems[currentIndex].total_picked = currentItem.total_needed;
    newItems[currentIndex].allocations = currentItem.allocations.map(a => ({
      ...a,
      picked_quantity: a.quantity
    }));
    setGroupedItems(newItems);

    // 2. Save to DB
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Move to next item immediately for better UX
      goToNext();

      await Promise.all(currentItem.allocations.map(a =>
        PickingService.updatePickedQuantity(a.order_id, currentItem.product_id, a.quantity, currentItem.gtin || '', user?.id || '')
      ));

      await Promise.all(currentItem.allocations.map(a =>
        WarehouseService.logAction({
          orderId: a.order_id,
          action: 'ITEM_PICKED',
          details: { product_id: currentItem.product_id, quantity: a.quantity },
          userId: user?.id
        })
      ));
    } catch (err) {
      console.error('Failed to save picked qty:', err);
    } finally {
      processingRef.current = false;
    }
  }, [currentItem, currentIndex, groupedItems, goToNext]);

  const handleSkip = useCallback(async (reason: string) => {
    if (!currentItem) return;
    try {
      await Promise.all(currentItem.allocations.map(a =>
        PickingService.skipProduct(a.order_id, currentItem.product_id, reason)
      ));
      goToNext();
    } catch (err) {
      console.error('Skip failed:', err);
    }
  }, [currentItem, goToNext]);

  const saveLocation = useCallback(async (newLoc: string) => {
    if (!currentItem?.product_id) return;
    setSavingLocation(true);
    try {
      const cleanLoc = newLoc.trim().toUpperCase() || null;
      await supabase
        .from('products')
        .update({ warehouse_location: cleanLoc, updated_at: new Date().toISOString() })
        .eq('id', currentItem.product_id);

      const newItems = [...groupedItems];
      newItems[currentIndex].location = cleanLoc;
      setGroupedItems(newItems);
      setEditingLocation(false);
      speakRef.current(`Location updated to ${cleanLoc || 'none'}.`);
    } catch (err) {
      console.error('Error saving location:', err);
    } finally {
      setSavingLocation(false);
    }
  }, [currentItem, currentIndex, groupedItems]);

  const saveStock = useCallback(async (newQty: number) => {
    if (!currentItem?.product_id) return;
    setSavingStock(true);
    try {
      await InventoryService.updateStock(
        currentItem.product_id,
        newQty,
        'Adjusted during batch picking',
        undefined,
        'CentralHub Mobile Picking',
        `Stock corrected while picking batch`
      );
      const newItems = [...groupedItems];
      newItems[currentIndex].stock = newQty;
      setGroupedItems(newItems);
      setEditingStock(false);
      speakRef.current(`Stock updated to ${newQty}.`);
    } catch (err) {
      console.error('Error saving stock:', err);
      alert('Failed to save stock adjustment.');
    } finally {
      setSavingStock(false);
    }
  }, [currentItem, currentIndex, groupedItems]);

  const handleVoiceCommand = useCallback(async (command: string) => {
    if (isPaused && !command.includes('resume')) return;

    const now = Date.now();
    if (now - lastActionTimeRef.current < 800) return; // Reduced debounce for better responsiveness

    console.log('[Voice] Processing command:', command);

    // 1. Standard Command Detection (Regex - Fast Path)
    const isNegative = /\b(not|no|don't|stop|never|cancel)\b/i.test(command);

    const isPicked = !isNegative && /\b(picked|pick|done|finish|completed|got it|check|confirmed|did|ok|okay|yes|yeah|yep|all set)\b/i.test(command);
    const isNext = /\b(next|forward|skip|ignore|move|later|go on|skip this)\b/i.test(command);
    const isBack = /\b(back|previous|return|last|go back|before)\b/i.test(command);
    const isRepeat = /\b(repeat|say again|what|help|info|item|details|again|where)\b/i.test(command);
    const isPause = /\b(pause|stop|wait|hold|suspend|quiet)\b/i.test(command);
    const isResume = /\b(resume|start|continue|go|ready|listen)\b/i.test(command);
    const isConfirm = /\b(confirm|complete|finish|close|end|save|yes|done|final)\b/i.test(command);

    // 2. Action Execution
    if (showSummary && isConfirm) {
      lastActionTimeRef.current = now;
      speakRef.current('Finishing session. Good job.');
      completePicking();
      return;
    }

    if (isPause) {
      setIsPaused(true);
      speakRef.current('Voice suspended.');
      return;
    }

    if (isResume) {
      setIsPaused(false);
      speakRef.current('Voice resumed. Ready to pick.');
      return;
    }

    if (isPicked) {
      lastActionTimeRef.current = now;
      speakRef.current('Got it.'); // Faster feedback
      handlePicked();
      return;
    }

    if (isNext) {
      lastActionTimeRef.current = now;
      const isLast = currentIndex >= groupedItems.length - 1;
      if (isLast) {
        speakRef.current('Showing summary.');
        setShowSummary(true);
      } else {
        speakRef.current('Next.');
        goToNext();
      }
      return;
    }

    if (isBack) {
      lastActionTimeRef.current = now;
      speakRef.current('Going back.');
      goToPrev();
      return;
    }

    if (isRepeat) {
      if (currentItem) {
        const text = `Pick ${currentItem.total_needed} ${currentItem.brand || ''} ${currentItem.name}. ${currentItem.location ? `Location ${currentItem.location}` : ''}`;
        speakRef.current(text);
      }
      return;
    }

    // 3. Fallback for ambiguous commands (e.g., "I only found two")
    if (useAI) {
      setIsThinking(true);
      try {
        const context = `Current item: ${currentItem?.name}. Brand: ${currentItem?.brand}. Location: ${currentItem?.location}. Total needed: ${currentItem?.total_needed}. Summary shown: ${showSummary}.`;
        const aiResult = await PickingAIService.processCommand(command, context);

        console.log('[Voice] AI Action:', aiResult.action);

        if (aiResult.message) speakRef.current(aiResult.message);

        switch (aiResult.action) {
          case 'PICK': handlePicked(); break;
          case 'NEXT': goToNext(); break;
          case 'BACK': goToPrev(); break;
          case 'REPEAT':
            if (currentItem) {
               const text = `Pick ${currentItem.total_needed} ${currentItem.brand || ''} ${currentItem.name}. ${currentItem.location ? `Location ${currentItem.location}` : ''}`;
               speakRef.current(text);
            }
            break;
          case 'PAUSE': setIsPaused(true); break;
          case 'RESUME': setIsPaused(false); break;
          case 'FINISH':
            if (showSummary) completePicking();
            else setShowSummary(true);
            break;
          case 'UPDATE_STOCK':
            if (aiResult.value !== undefined) {
              const val = Number(aiResult.value);
              if (!isNaN(val)) saveStock(val);
            }
            break;
          case 'UPDATE_LOCATION':
            if (aiResult.value) {
              saveLocation(String(aiResult.value));
            }
            break;
          default:
            console.warn('[Voice] AI returned unknown action:', aiResult.action);
        }
      } catch (err) {
        console.error('AI Command Processing Failed:', err);
      } finally {
        setIsThinking(false);
      }
      return;
    }

    console.warn('[Voice] Unrecognized command:', command);

  }, [handlePicked, goToNext, goToPrev, isPaused, currentItem, showSummary, completePicking, useAI, currentIndex, groupedItems.length, saveLocation, saveStock]);

  const { speak, startListening, stopListening, isListening, error: voiceError, lastCommand } = useVoicePicking(handleVoiceCommand);

  // Sync speak ref
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  const fetchOrders = useCallback(async () => {
    if (orderIds.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(orderIds.map(id => PickingService.getOrderForPicking(id)));
      const validOrders = results.filter((o): o is OrderWithItems => !!o);
      setOrders(validOrders);

      const itemGroups = new Map<string, GroupedItem>();
      validOrders.forEach(order => {
        order.items.forEach((item: any) => {
          if (!item.product_id) return;
          if (!itemGroups.has(item.product_id)) {
            itemGroups.set(item.product_id, {
              product_id: item.product_id,
              name: item.product_name,
              brand: item.brand,
              weight: item.weight,
              image: item.product_image,
              location: item.warehouse_location,
              gtin: item.gtin,
              stock: null,
              allocations: [],
              total_needed: 0,
              total_picked: 0
            });
          }
          const group = itemGroups.get(item.product_id)!;
          group.allocations.push({
            order_id: order.id,
            order_number: order.order_number,
            quantity: item.quantity,
            picked_quantity: item.picked_quantity || 0
          });
          group.total_needed += item.quantity;
          group.total_picked += (item.picked_quantity || 0);
        });
      });

      // Fetch stock for all items
      const pIds = Array.from(itemGroups.keys());
      if (pIds.length > 0) {
        const { data: stocks } = await supabase.from('central_inventory').select('product_id, stock_quantity').in('product_id', pIds);
        stocks?.forEach(s => {
          if (itemGroups.has(s.product_id)) {
            itemGroups.get(s.product_id)!.stock = s.stock_quantity;
          }
        });
      }

      const sortedGroups = Array.from(itemGroups.values()).sort((a, b) => {
        const locA = a.location || 'ZZZ';
        const locB = b.location || 'ZZZ';
        return locA.localeCompare(locB, undefined, { numeric: true });
      });

      setGroupedItems(sortedGroups);

      // Restoration logic moved to a separate useEffect to prevent loops
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, [orderIds]); // Removed dependencies that change during picking

  // Restore progress once when items are loaded
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!loading && groupedItems.length > 0 && !hasRestoredRef.current) {
      if (savedProgress && savedProgress.orderIds.join(',') === idsStr) {
        setCurrentIndex(savedProgress.index);
      } else {
        const firstIncomplete = groupedItems.findIndex(g => g.total_picked < g.total_needed);
        if (firstIncomplete !== -1) setCurrentIndex(firstIncomplete);
      }
      hasRestoredRef.current = true;
    }
  }, [loading, groupedItems, savedProgress, idsStr]);

  // Auto-show summary if everything is done
  useEffect(() => {
    if (!loading && groupedItems.length > 0 && !showSummary) {
      const allDone = groupedItems.every(g => g.total_picked >= g.total_needed);
      if (allDone && !processingRef.current) {
        console.log('[Picking] All items picked, auto-switching to summary');
        setShowSummary(true);
      }
    }
  }, [loading, groupedItems, showSummary]);

  useEffect(() => {
    fetchOrders();
    // Auto-start assistant
    const timer = setTimeout(() => {
      startListening();
    }, 1500);

    return () => {
      stopListening();
      clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.speechSynthesis.cancel();
      }
    };
  }, [fetchOrders, stopListening, startListening]);

  const lastSpokenIndexRef = useRef(-1);

  useEffect(() => {
    if (currentItem && !loading && !isPaused && !showSummary && currentIndex !== lastSpokenIndexRef.current) {
      const text = `${currentItem.location ? `Location ${currentItem.location}. ` : ''}Pick ${currentItem.total_needed} ${currentItem.brand || ''} ${currentItem.name} ${currentItem.weight || ''}.`;
      speakRef.current(text);
      lastSpokenIndexRef.current = currentIndex;
    }

    if (showSummary && !loading && !isPaused && lastSpokenIndexRef.current !== -99) {
      speakRef.current('Picking complete. Please review the list and confirm.');
      lastSpokenIndexRef.current = -99; // Special value for summary
    }
  }, [currentItem, currentIndex, loading, isPaused, showSummary]);

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Initializing Assistant...</p>
      </div>
    );
  }

  if (!loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-slate-400 font-black uppercase tracking-widest text-sm mb-6">No active orders</p>
        <button onClick={() => router.push('/picking')} className="bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-black/40 border border-slate-700">Go Back</button>
      </div>
    );
  }

  if (showSummary) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col">
        <div className="flex-1 space-y-6">
          <header>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-cyan-400">Picking Ready</h1>
            <p className="text-slate-500 font-bold uppercase text-xs mt-1">{orderIds.length} Orders processed</p>
          </header>
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
             <div className="flex justify-between items-end border-b border-slate-800 pb-4">
                <div><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Total SKUs</p><p className="text-3xl font-black">{groupedItems.length}</p></div>
                <div className="text-right"><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Picked</p><p className="text-3xl font-black text-emerald-400">{groupedItems.filter(g => g.total_picked >= g.total_needed).length}</p></div>
             </div>
             <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                {groupedItems.map(g => (
                  <div key={g.product_id} className="flex items-center justify-between gap-4 py-2 border-b border-slate-800/40 last:border-0">
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold truncate text-slate-100">{g.name}</p><p className="text-[10px] text-slate-500 uppercase font-bold">{g.brand}</p></div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${g.total_picked >= g.total_needed ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>{g.total_picked} / {g.total_needed}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
        <div className="space-y-3 pt-6 pb-safe-bottom">
           <button onClick={completePicking} className="w-full bg-cyan-600 text-white font-black py-5 rounded-[2rem] text-xl shadow-2xl shadow-cyan-900/40 active:scale-[0.98] transition-all">CONFIRM & CLOSE</button>
           <button onClick={() => setShowSummary(false)} className="w-full bg-slate-800 text-slate-400 font-black py-4 rounded-[1.5rem] text-sm uppercase tracking-widest border border-slate-700">Review List</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col overflow-hidden text-white pt-safe-top">
      <header className="px-6 py-4 flex justify-between items-center bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex -space-x-3 overflow-hidden">
            {orders.map(o => (
              <div key={o.id} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[8px] font-black text-blue-400 shadow-lg">
                {o.order_number.slice(-3)}
              </div>
            ))}
          </div>
          <div><p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Pick Progress</p><p className="text-sm font-black text-cyan-400">{currentIndex + 1} <span className="text-slate-700 mx-1">/</span> {groupedItems.length}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {lastCommand && isListening && (
            <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-3 py-1.5 rounded-full border border-cyan-500/30 font-black uppercase animate-pulse shadow-lg max-w-[120px] truncate">
              &quot;{lastCommand}&quot;
            </span>
          )}
          {voiceError && (
            <span className="text-[8px] bg-rose-500/20 text-rose-400 px-2.5 py-1 rounded-full border border-rose-500/30 font-black uppercase max-w-[100px] truncate">
              {voiceError}
            </span>
          )}
          <button
            onClick={() => isListening ? stopListening() : startListening()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all shadow-xl ${isListening ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
          >
            <span className={`w-2 h-2 rounded-full ${isListening ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}`} />
            <span className="text-[9px] font-black uppercase tracking-wider">{isListening ? 'Listening' : 'Off'}</span>
          </button>
          <button onClick={() => setIsPaused(!isPaused)} className="p-2.5 bg-slate-800 rounded-2xl border border-slate-700 shadow-lg active:scale-90 transition-transform">
             {isPaused ? '▶️' : '⏸️'}
          </button>
          <button
            onClick={() => setUseAI(!useAI)}
            className={`px-3 py-1.5 rounded-full border transition-all text-[9px] font-black uppercase flex items-center gap-1 ${useAI ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
            title={useAI ? "AI Assistant Active (Smart Fallback)" : "Standard Mode (Fast)"}
          >
            {isThinking ? (
              <span className="w-2 h-2 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>{useAI ? '🤖 AI' : '⚡ Std'}</span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 space-y-8 overflow-y-auto">
        <div className="space-y-5 text-center">
           <div className="w-full aspect-square max-w-[280px] mx-auto bg-white rounded-[3.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative border-4 border-slate-900 group">
              <ProductImage imageUrl={currentItem?.image} alt={currentItem?.name} className="w-full h-full object-contain p-6 transition-transform duration-500 group-hover:scale-110" />
              {currentItem?.location && (
                <button
                  onClick={() => {
                    setLocationInput(currentItem.location || '');
                    setEditingLocation(true);
                  }}
                  className="absolute top-4 left-4 bg-amber-400 text-slate-950 px-5 py-2.5 rounded-2xl font-black text-2xl shadow-2xl border-2 border-white/20 active:scale-95 transition-transform"
                >
                  {currentItem.location}
                </button>
              )}
              {!currentItem?.location && (
                <button
                  onClick={() => {
                    setLocationInput('');
                    setEditingLocation(true);
                  }}
                  className="absolute top-4 left-4 bg-slate-800 text-slate-400 px-4 py-2 rounded-xl font-bold text-xs border border-slate-700 active:scale-95 transition-transform"
                >
                  + Add Location
                </button>
              )}

              <button
                onClick={() => {
                  setStockInput(String(currentItem?.stock ?? 0));
                  setEditingStock(true);
                }}
                className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur-md text-white px-4 py-2 rounded-xl font-bold text-xs border border-white/10 active:scale-95 transition-transform"
              >
                Stock: {currentItem?.stock ?? '—'}
              </button>
           </div>
           <div>
             <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-[10px] mb-1">{currentItem?.brand || 'Catalog Item'}</p>
             <h2 className="text-3xl sm:text-4xl font-black leading-[0.9] uppercase tracking-tighter text-white drop-shadow-lg">{currentItem?.name}</h2>
             <p className="text-xl font-black text-slate-400 mt-2">{currentItem?.weight}</p>
           </div>
        </div>

        <div className="flex flex-col items-center justify-center bg-slate-900/40 rounded-[2.5rem] py-6 px-4 border border-slate-800/50 shadow-inner">
           <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mb-3">Quantity to Pick</p>
           <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
              <div className="text-7xl sm:text-9xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{currentItem?.total_needed}</div>
              <div className="hidden sm:block h-20 w-px bg-slate-800" />
              <div className="text-center sm:text-left">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Breakdown</p>
                <div className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1">
                  {currentItem?.allocations.map(a => (
                    <p key={a.order_id} className="text-sm font-bold flex items-center gap-2">
                      <span className="text-blue-400 font-mono">#{a.order_number.slice(-4)}</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-slate-100">{a.quantity}</span>
                    </p>
                  ))}
                </div>
              </div>
           </div>
        </div>

        <div className="mt-auto text-center pb-4">
           <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border transition-colors ${isThinking ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-900/50 border-slate-800/50'}`}>
             <span className={`${isThinking ? 'text-cyan-400 animate-spin' : 'text-cyan-400 animate-pulse'}`}>
               {isThinking ? '↻' : '●'}
             </span>
             <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
               {isThinking ? 'AI is processing...' : isListening ? 'Say "Picked", "Done" or "Next"' : 'Enable Microphone to Start'}
             </p>
           </div>
        </div>
      </main>

      <footer className="p-6 bg-slate-900 border-t border-slate-800 pb-safe-bottom">
        <div className="grid grid-cols-12 gap-3 mb-4">
           <button onClick={goToPrev} disabled={currentIndex === 0} className="col-span-2 bg-slate-800 disabled:opacity-30 rounded-2xl flex items-center justify-center text-xl shadow-lg border border-slate-700 active:scale-90 transition-transform">⬅️</button>
           <button onClick={handlePicked} className="col-span-8 bg-emerald-600 text-white font-black py-6 rounded-[2rem] text-3xl shadow-[0_10px_30px_rgba(16,185,129,0.3)] active:scale-[0.97] transition-all flex items-center justify-center gap-4">
             <span>PICKED</span><span className="text-2xl">✓</span>
           </button>
           <button onClick={goToNext} className="col-span-2 bg-slate-800 rounded-2xl flex items-center justify-center text-xl shadow-lg border border-slate-700 active:scale-90 transition-transform">➡️</button>
        </div>
        <div className="grid grid-cols-3 gap-3">
           <button onClick={() => {
              if (currentItem) {
                const text = `Pick ${currentItem.total_needed} ${currentItem.brand || ''} ${currentItem.name}. ${currentItem.location ? `Location ${currentItem.location}` : ''}`;
                speak(text);
              }
           }} className="bg-slate-800/60 py-4 rounded-2xl text-[10px] font-black uppercase text-slate-400 border border-slate-800 shadow-md">📢 Repeat</button>
           <button onClick={() => handleSkip('Missing')} className="bg-rose-950/20 py-4 rounded-2xl text-[10px] font-black uppercase text-rose-500 border border-rose-900/20 shadow-md">❌ Missing</button>
           <button onClick={() => router.push('/picking')} className="bg-slate-800/60 py-4 rounded-2xl text-[10px] font-black uppercase text-slate-400 border border-slate-800 shadow-md">⏹️ Exit</button>
        </div>
      </footer>

      {isPaused && (
        <div className="absolute inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-300">
           <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800">
             <p className="text-5xl">⏸️</p>
           </div>
           <h2 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Picking Paused</h2>
           <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-12">All voice commands are suspended</p>
           <button onClick={() => setIsPaused(false)} className="w-full max-w-xs bg-cyan-600 text-white font-black py-6 rounded-[2.5rem] text-2xl shadow-2xl shadow-cyan-900/40 active:scale-95 transition-all">RESUME PICKING</button>
        </div>
      )}

      {/* Manual Correction Modals */}
      {(editingLocation || editingStock) && (
        <div className="absolute inset-0 z-[150] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in zoom-in-95 duration-200">
           <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
              <h3 className="text-2xl font-black uppercase tracking-tighter text-white">
                {editingLocation ? 'Correct Location' : 'Adjust Stock'}
              </h3>

              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  {editingLocation ? 'New Bin / Shelf ID' : 'Actual Shelf Quantity'}
                </p>
                <input
                  type={editingStock ? 'number' : 'text'}
                  value={editingLocation ? locationInput : stockInput}
                  onChange={(e) => editingLocation ? setLocationInput(e.target.value) : setStockInput(e.target.value)}
                  autoFocus
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-cyan-500 rounded-2xl px-6 py-4 text-2xl font-black text-white outline-none transition-colors"
                  placeholder={editingLocation ? "e.g. A-1-B" : "0"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setEditingLocation(false);
                    setEditingStock(false);
                  }}
                  className="bg-slate-800 text-slate-400 font-bold py-4 rounded-2xl uppercase tracking-widest text-xs border border-slate-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={savingLocation || savingStock}
                  onClick={() => {
                    if (editingLocation) saveLocation(locationInput);
                    else saveStock(parseInt(stockInput, 10) || 0);
                  }}
                  className="bg-cyan-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs shadow-lg shadow-cyan-900/40 active:scale-95 transition-all disabled:opacity-50"
                >
                  {(savingLocation || savingStock) ? 'Saving...' : 'Update'}
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PickingService } from '@/lib/services/pickingService';
import { InventoryService } from '@/lib/services/inventoryService';
import ProductImage from '@/components/ProductImage';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_image: string | null;
  quantity: number;
  picked_quantity: number;
  brand: string | null;
  weight: string | null;
  unit: string | null;
  current_stock: number | null;
  products: {
    name: string;
    brand: string | null;
    weight: string | null;
    gtin: string | null;
    warehouse_location: string | null;
    expiry_date: string | null;
  } | null;
  skip_reason: string | null;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  order_status: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  company_name?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_postcode?: string | null;
  total?: number | null;
}

export default function PickingClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState<{ expected: string; scanned: string; name: string } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [outOfStockCount, setOutOfStockCount] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [editingStock, setEditingStock] = useState(false);
  const [stockInput, setStockInput] = useState('');
  const [savingStock, setSavingStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    setStartTime(new Date());
  }, []);

  const fetchOrderDetails = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, order_status, customer_email, customer_phone, company_name, delivery_address, delivery_city, delivery_postcode, total, picked_by_user, items')
        .eq('id', id)
        .single();

      if (orderError) throw orderError;
      if (!orderData) throw new Error('Order not found');

      if (orderData.picked_by_user && orderData.picked_by_user !== user?.id) {
        alert('This order is already being picked by another user.');
        router.push('/picking');
        return;
      }

      if (!orderData.picked_by_user) {
        await supabase
          .from('orders')
          .update({ picked_by_user: user?.id })
          .eq('id', id);
      }

      setOrder(orderData);

      let rawItems = Array.isArray(orderData.items) ? orderData.items : [];

      // Fallback: if items JSONB is empty, fetch from order_items table
      if (rawItems.length === 0) {
        const { data: orderItemsData, error: orderItemsError } = await supabase
          .from('order_items')
          .select('product_id, product_name, product_image, quantity, unit_price, total_price, brand, weight, unit, picked_quantity, skip_reason')
          .eq('order_id', id);

        if (!orderItemsError && orderItemsData && orderItemsData.length > 0) {
          rawItems = orderItemsData.map((item: any) => ({
            product_id: item.product_id,
            name: item.product_name,
            image: item.product_image,
            quantity: item.quantity,
            price: item.unit_price,
            subtotal: item.total_price,
            brand: item.brand,
            weight: item.weight,
            unit: item.unit,
            picked_quantity: item.picked_quantity || 0,
            skip_reason: item.skip_reason || null,
          }));
        }
      }

      const productIds = rawItems
        .map((it: any) => it.product_id)
        .filter((pid: any): pid is string => typeof pid === 'string');

      let productMap = new Map<string, any>();
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, brand, weight, gtin, warehouse_location, expiry_date')
          .in('id', productIds);

        (products || []).forEach((p: any) => {
          productMap.set(p.id, p);
        });
      }

      let stockMap = new Map<string, number>();
      if (productIds.length > 0) {
        const { data: inventoryRows } = await supabase
          .from('central_inventory')
          .select('product_id, stock_quantity')
          .in('product_id', productIds);

        (inventoryRows || []).forEach((inv: any) => {
          stockMap.set(inv.product_id, inv.stock_quantity ?? 0);
        });
      }

      const itemsData: OrderItem[] = rawItems.map((it: any, idx: number) => {
        const product = it.product_id ? productMap.get(it.product_id) : null;
        return {
          id: `${orderData.id}-${idx}`,
          order_id: orderData.id,
          product_id: it.product_id || null,
          product_name: it.name || product?.name || 'Unknown Product',
          product_image: it.image || null,
          quantity: it.quantity || 1,
          picked_quantity: it.picked_quantity || 0,
          brand: it.brand || product?.brand || null,
          weight: it.weight != null ? String(it.weight) : (product?.weight || null),
          unit: it.unit || null,
          current_stock: it.product_id ? (stockMap.get(it.product_id) ?? null) : null,
          skip_reason: it.skip_reason || null,
          products: product ? {
            name: product.name,
            brand: product.brand || null,
            weight: product.weight || null,
            gtin: product.gtin || null,
            warehouse_location: product.warehouse_location || null,
            expiry_date: product.expiry_date || null,
          } : null,
        };
      });

      const sortedItems = itemsData.sort((a, b) => {
        // Primary sort: Expiry Date (FEFO - First Expired First Out)
        const dateA = a.products?.expiry_date ? new Date(a.products.expiry_date).getTime() : Infinity;
        const dateB = b.products?.expiry_date ? new Date(b.products.expiry_date).getTime() : Infinity;

        if (dateA !== dateB) {
          return dateA - dateB;
        }

        // Secondary sort: Warehouse Location
        const locA = a.products?.warehouse_location || 'Z';
        const locB = b.products?.warehouse_location || 'Z';
        return locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      });

      setItems(sortedItems);

      const firstUnpicked = sortedItems.findIndex(item => item.picked_quantity < item.quantity);
      if (firstUnpicked !== -1) {
        setCurrentIndex(firstUnpicked);
      }

    } catch (err: any) {
      console.error('Error fetching order details:', err);
      setError(err?.message || 'Failed to load order details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
    }
  }, [id, fetchOrderDetails]);

  const currentItem = items[currentIndex];

  const getDisplayName = (item: OrderItem) => item.products?.name || item.product_name || 'Unknown Product';
  const getDisplayBrand = (item: OrderItem) => item.products?.brand || item.brand || null;
  const getDisplayWeight = (item: OrderItem) => item.products?.weight || item.weight || null;
  const getDisplayGtin = (item: OrderItem) => item.products?.gtin || null;
  const getDisplayLocation = (item: OrderItem) => item.products?.warehouse_location || null;
  const getDisplayExpiry = (item: OrderItem) => item.products?.expiry_date || null;
  const getDisplayImage = (item: OrderItem) => item.product_image || null;
  const getDisplayNotes = (_item: OrderItem) => null;

  async function handleScan(scannedGtin: string) {
    if (!currentItem || !order) return;

    const expectedGtin = getDisplayGtin(currentItem);

    // Requirement: If product has no GTIN, save the scanned one to products.gtin
    if (!expectedGtin && currentItem.product_id) {
      console.log(`[Picking] Assigning scanned barcode ${scannedGtin} to product ${currentItem.product_id}`);
      try {
        await supabase
          .from('products')
          .update({ gtin: scannedGtin, updated_at: new Date().toISOString() })
          .eq('id', currentItem.product_id);

        // Update local state to reflect the new GTIN
        const newItems = [...items];
        if (newItems[currentIndex].products) {
          newItems[currentIndex].products!.gtin = scannedGtin;
        }
        setItems(newItems);
      } catch (err) {
        console.error('Error saving new GTIN during picking:', err);
      }

      // Proceed with picking logic as if it matched
      const newPickedQty = currentItem.picked_quantity + 1;
      const updatedItems = [...items];
      updatedItems[currentIndex].picked_quantity = newPickedQty;
      setItems(updatedItems);

      try {
        await PickingService.updatePickedQuantity(order.id, currentItem.product_id, newPickedQty, scannedGtin, '');
      } catch (err) {
        console.error('Error saving picked quantity:', err);
      }

      if (newPickedQty >= currentItem.quantity) {
        moveToNextProduct(updatedItems);
      }
      return;
    }

    if (scannedGtin === expectedGtin) {
      const newPickedQty = currentItem.picked_quantity + 1;

      const newItems = [...items];
      newItems[currentIndex].picked_quantity = newPickedQty;
      setItems(newItems);

      try {
        await PickingService.updatePickedQuantity(order.id, currentItem.product_id, newPickedQty, scannedGtin, '');
      } catch (err) {
        console.error('Error saving picked quantity:', err);
      }

      if (newPickedQty >= currentItem.quantity) {
        moveToNextProduct(newItems);
      }
    } else {
      setScanWarning({
        expected: expectedGtin || 'None',
        scanned: scannedGtin,
        name: getDisplayName(currentItem)
      });

      if (typeof window !== 'undefined' && window.navigator.vibrate) {
        window.navigator.vibrate([200, 100, 200]);
      }
    }
  }

  function moveToNextProduct(updatedItems: OrderItem[]) {
    const nextIndex = updatedItems.findIndex((item, index) => index > currentIndex && item.picked_quantity < item.quantity);
    if (nextIndex !== -1) {
      setCurrentIndex(nextIndex);
    } else {
      const anyRemaining = updatedItems.findIndex(item => item.picked_quantity < item.quantity && !item.skip_reason);
      if (anyRemaining !== -1) {
        setCurrentIndex(anyRemaining);
      } else {
        setShowSummary(true);
        autoCompletePicking();
      }
    }
  }

  async function autoCompletePicking() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const endTime = new Date();
      const durationSeconds = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : 0;
      const result = await PickingService.completePicking(id, durationSeconds);
      if (!result.success) {
        setCompleteError(result.error || 'Failed to update order status');
      }
    } catch (err) {
      console.error('Error auto-completing picking:', err);
      setCompleteError('Failed to update order status. Please try again.');
    } finally {
      setCompleting(false);
    }
  }

  async function handlePickedManually() {
    if (!currentItem || !order) return;

    const newPickedQty = currentItem.picked_quantity + 1;

    const newItems = [...items];
    newItems[currentIndex].picked_quantity = newPickedQty;
    setItems(newItems);

    try {
      await PickingService.updatePickedQuantity(order.id, currentItem.product_id, newPickedQty, '', '');
    } catch (err) {
      console.error('Error saving picked quantity:', err);
    }

    if (newPickedQty >= currentItem.quantity) {
      moveToNextProduct(newItems);
    }
  }

  function goToNextItem() {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  function goToPrevItem() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const SWIPE_THRESHOLD = 80;

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwipeOffset(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setSwipeOffset(deltaX);
    }
  }

  function handleTouchEnd() {
    if (swipeOffset > SWIPE_THRESHOLD) {
      goToPrevItem();
    } else if (swipeOffset < -SWIPE_THRESHOLD) {
      goToNextItem();
    }
    setSwipeOffset(0);
    touchStartX.current = null;
    touchStartY.current = null;
  }

  async function skipProduct(reason: string) {
    if (!currentItem || !order) return;

    const newItems = [...items];
    newItems[currentIndex].skip_reason = reason;
    setItems(newItems);

    try {
      await PickingService.skipProduct(order.id, currentItem.product_id, reason);
    } catch (err) {
      console.error('Error skipping product:', err);
    }

    if (reason === 'Out of Stock') {
      setOutOfStockCount(prev => prev + 1);
    } else {
      setSkippedCount(prev => prev + 1);
    }

    moveToNextProduct(newItems);
  }

  async function saveLocation() {
    if (!currentItem?.product_id) return;
    setSavingLocation(true);
    try {
      await supabase
        .from('products')
        .update({ warehouse_location: locationInput.trim() || null })
        .eq('id', currentItem.product_id);

      const newItems = [...items];
      if (newItems[currentIndex].products) {
        newItems[currentIndex].products!.warehouse_location = locationInput.trim() || null;
      }
      setItems(newItems);
      setEditingLocation(false);
    } catch (err) {
      console.error('Error saving location:', err);
    } finally {
      setSavingLocation(false);
    }
  }

  function openLocationEditor() {
    setLocationInput(getDisplayLocation(currentItem) || '');
    setEditingLocation(true);
  }

  function openStockEditor() {
    setStockInput(String(currentItem?.current_stock ?? 0));
    setEditingStock(true);
  }

  async function saveStock() {
    if (!currentItem?.product_id) return;
    const newQty = parseInt(stockInput, 10);
    if (isNaN(newQty) || newQty < 0) return;
    setSavingStock(true);
    try {
      await InventoryService.updateStock(
        currentItem.product_id,
        newQty,
        'Adjusted during picking',
        undefined,
        'CentralHub Picking',
        `Stock updated while picking order ${order?.order_number || ''}`
      );
      const newItems = [...items];
      newItems[currentIndex].current_stock = newQty;
      setItems(newItems);
      setEditingStock(false);
    } catch (err: any) {
      console.error('Error saving stock:', err);
      alert('Failed to save stock: ' + (err?.message || 'Unknown error'));
    } finally {
      setSavingStock(false);
    }
  }

  function getDisplayStock(item: OrderItem | undefined): number | null {
    return item?.current_stock ?? null;
  }

  async function cancelPicking() {
    if (!confirm('Are you sure you want to cancel picking? All progress for this order will be reset.')) return;

    try {
      await PickingService.cancelPicking(id);
      router.push('/picking');
    } catch (err) {
      console.error('Error cancelling picking:', err);
    }
  }

  async function completePicking() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const endTime = new Date();
      const durationSeconds = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : 0;

      const result = await PickingService.completePicking(id, durationSeconds);
      if (!result.success) {
        setCompleteError(result.error || 'Failed to update order status');
        setCompleting(false);
        return;
      }

      router.push('/picking');
    } catch (err) {
      console.error('Error completing picking:', err);
      setCompleteError('Failed to update order status. Please try again.');
      setCompleting(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  if (error || !order) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-8 space-y-4">
      <p className="text-2xl font-bold text-rose-400">{error || 'Order not found.'}</p>
      <button onClick={() => router.push('/picking')} className="bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-xl font-bold transition-colors">
        Back to Picking Queue
      </button>
    </div>
  );

  if (showSummary) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-8 flex flex-col items-center justify-center space-y-6 sm:space-y-8">
        <h1 className="text-2xl sm:text-4xl font-bold text-center">Picking Completed</h1>

        <div className="grid grid-cols-2 gap-4 sm:gap-8 w-full max-w-2xl">
          <div className="bg-slate-800 p-4 sm:p-6 rounded-2xl text-center border border-slate-700">
            <p className="text-slate-400 text-xs sm:text-sm uppercase font-bold mb-1">Products Picked</p>
            <p className="text-2xl sm:text-4xl font-mono text-cyan-400">{items.filter(i => i.picked_quantity >= i.quantity).length} / {items.length}</p>
          </div>
          <div className="bg-slate-800 p-4 sm:p-6 rounded-2xl text-center border border-slate-700">
            <p className="text-slate-400 text-xs sm:text-sm uppercase font-bold mb-1">Time Taken</p>
            <p className="text-2xl sm:text-4xl font-mono text-cyan-400">{startTime ? Math.floor((new Date().getTime() - startTime.getTime()) / 60000) : 0}m</p>
          </div>
          <div className="bg-slate-800 p-4 sm:p-6 rounded-2xl text-center border border-slate-700">
            <p className="text-slate-400 text-xs sm:text-sm uppercase font-bold mb-1">Skipped</p>
            <p className="text-2xl sm:text-4xl font-mono text-orange-400">{skippedCount}</p>
          </div>
          <div className="bg-slate-800 p-4 sm:p-6 rounded-2xl text-center border border-slate-700">
            <p className="text-slate-400 text-xs sm:text-sm uppercase font-bold mb-1">Out of Stock</p>
            <p className="text-2xl sm:text-4xl font-mono text-rose-400">{outOfStockCount}</p>
          </div>
        </div>

        {completeError && (
          <div className="w-full max-w-2xl bg-rose-900/50 border border-rose-500/50 text-rose-300 p-4 rounded-xl text-center font-bold">
            {completeError}
          </div>
        )}

        <div className="w-full max-w-2xl space-y-3 sm:space-y-4">
          <button
            onClick={completePicking}
            disabled={completing}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 sm:py-6 rounded-2xl text-lg sm:text-2xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-3"
          >
            {completing ? (
              <>
                <span className="animate-spin inline-block w-6 h-6 border-[3px] border-white/30 border-t-white rounded-full" />
                Saving...
              </>
            ) : 'Move to Packing'}
          </button>

          <button
            onClick={() => router.push('/picking')}
            disabled={completing}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold py-3 sm:py-5 rounded-2xl text-base sm:text-xl transition-all"
          >
            Back to Queue
          </button>
        </div>
      </div>
    );
  }

  const upcomingItems = items.filter((_, idx) => idx > currentIndex && idx <= currentIndex + 5);
  const lastPickedItems = items.filter((item, idx) => idx < currentIndex && item.picked_quantity > 0).slice(-5).reverse();

  const routeStops = items.map((item, idx) => {
    const loc = getDisplayLocation(item) || 'No Location';
    return { loc, idx, done: item.picked_quantity >= item.quantity, current: idx === currentIndex };
  });

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-hidden">
      <header className="bg-slate-900 text-white p-3 sm:p-4 flex justify-between items-center border-b border-slate-800 gap-2">
        <div className="flex gap-4 sm:gap-8 items-center min-w-0 flex-1 overflow-x-auto no-scrollbar">
          <div className="flex-shrink-0">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Order</p>
            <p className="text-base sm:text-xl font-mono truncate">#{order.order_number}</p>
          </div>
          <div className="flex-shrink-0">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Customer</p>
            <p className="text-base sm:text-xl font-medium truncate max-w-[120px] sm:max-w-[200px]">{order.customer_name}</p>
          </div>
          <div className="flex-shrink-0">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Progress</p>
            <p className="text-base sm:text-xl font-mono text-cyan-400">{items.filter(i => i.picked_quantity >= i.quantity).length} / {items.length}</p>
          </div>
          <div className="hidden md:block flex-shrink-0">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Location</p>
            <p className="text-base sm:text-xl font-bold text-amber-400">{(currentItem && getDisplayLocation(currentItem)) || '—'}</p>
          </div>
          <div className="hidden lg:block flex-shrink-0">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Route</p>
            <p className="text-sm font-bold text-emerald-400">Optimized Path</p>
          </div>
        </div>
        <button
          onClick={cancelPicking}
          className="flex-shrink-0 bg-slate-800 hover:bg-rose-900/50 text-slate-300 hover:text-rose-400 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold border border-slate-700 transition-colors"
        >
          Cancel
        </button>
      </header>

      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-xs text-slate-500 font-bold uppercase tracking-widest flex-shrink-0 mr-2">Route:</span>
        {routeStops.map((stop, idx) => (
          <div key={idx} className="flex items-center gap-2 flex-shrink-0">
            {idx > 0 && <span className="text-slate-600 text-xs">→</span>}
            <div
              className={`px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                stop.current
                  ? 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/30 scale-110'
                  : stop.done
                  ? 'bg-emerald-700 text-emerald-200'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {stop.loc}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden lg:flex">
          <div className="p-4 border-b border-slate-800 bg-slate-800/50">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Last Picked</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {lastPickedItems.map(item => (
              <div key={item.id} className="bg-slate-800/40 border border-slate-700/50 p-2 rounded-xl flex gap-3 relative overflow-hidden">
                <div className="absolute top-1 right-1 text-emerald-400 text-xs font-bold">✅</div>
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-slate-700">
                  <ProductImage key={item.id} imageUrl={getDisplayImage(item)} alt={getDisplayName(item)} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 font-bold uppercase truncate">{getDisplayBrand(item) || ''}</p>
                  <p className="text-xs text-white font-medium truncate leading-tight">{getDisplayName(item)}</p>
                  <p className="text-[10px] text-emerald-400 font-bold mt-1 uppercase">Picked: {item.picked_quantity}</p>
                </div>
              </div>
            ))}
            {lastPickedItems.length === 0 && (
              <p className="text-slate-600 text-center text-xs mt-8">No items picked yet</p>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
          <div className="h-24 sm:h-28 bg-white border-b border-slate-200 p-2 flex gap-3 overflow-x-auto no-scrollbar">
            {upcomingItems.map(item => (
              <div key={item.id} className="w-40 sm:w-48 h-full bg-slate-50 border border-slate-200 rounded-xl p-2 flex gap-3 flex-shrink-0">
                <div className="w-16 h-full rounded-lg overflow-hidden flex-shrink-0 bg-white border border-slate-100">
                  <ProductImage key={item.id} imageUrl={getDisplayImage(item)} alt={getDisplayName(item)} />
                </div>
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{getDisplayLocation(item) || '—'}</p>
                  <p className="text-xs text-slate-900 font-bold truncate leading-tight">{getDisplayName(item)}</p>
                  <p className="text-[10px] text-slate-600 mt-1 uppercase">Need: {item.quantity} · Stock: {item.current_stock ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col md:flex-row gap-4 sm:gap-8 items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {currentItem ? (
              <>
                <div className="w-full md:w-2/5 lg:w-1/3 max-w-xs aspect-square rounded-3xl overflow-hidden shadow-2xl bg-white border-4 border-white">
                  <ProductImage key={currentItem.id} imageUrl={getDisplayImage(currentItem)} alt={getDisplayName(currentItem)} className="w-full h-full object-contain" />
                </div>

                <div className="flex-1 max-w-xl w-full space-y-4 sm:space-y-6">
                  <div>
                    {getDisplayBrand(currentItem) && (
                      <span className="bg-slate-900 text-white px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest">{getDisplayBrand(currentItem)}</span>
                    )}
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 mt-2 sm:mt-4 leading-tight">{getDisplayName(currentItem)}</h2>
                    <div className="flex items-center gap-2 sm:gap-4 mt-2 flex-wrap">
                      {getDisplayWeight(currentItem) && (
                        <span className="text-lg sm:text-2xl text-slate-500 font-medium">{getDisplayWeight(currentItem)}</span>
                      )}
                      {getDisplayExpiry(currentItem) && (
                        <>
                          <span className="text-lg sm:text-2xl text-slate-300 font-light">|</span>
                          <span className="text-lg sm:text-2xl text-rose-500 font-bold flex items-center gap-1">
                            <span className="text-sm uppercase tracking-tighter">Expires:</span>
                            {new Date(getDisplayExpiry(currentItem)!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </>
                      )}
                      {getDisplayGtin(currentItem) && (
                        <>
                          <span className="text-lg sm:text-2xl text-slate-300 font-light">|</span>
                          <span className="text-lg sm:text-2xl text-slate-500 font-mono tracking-tighter">{getDisplayGtin(currentItem)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-white border-2 border-slate-200 p-4 sm:p-6 rounded-3xl shadow-sm">
                      <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Required Quantity</p>
                      <p className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900">{currentItem.quantity}</p>
                      <div className="mt-3 sm:mt-4 flex items-center gap-2">
                        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${(currentItem.picked_quantity / currentItem.quantity) * 100}%` }}
                          />
                        </div>
                        <span className="text-lg sm:text-xl font-black text-emerald-600">{currentItem.picked_quantity}</span>
                      </div>
                    </div>

                    <div className="bg-sky-50 border-2 border-sky-200 p-4 sm:p-6 rounded-3xl shadow-sm">
                      <p className="text-[10px] sm:text-xs text-sky-600 font-black uppercase tracking-widest mb-1">Current Stock</p>
                      {editingStock ? (
                        <div className="mt-2 space-y-2">
                          <input
                            type="number"
                            value={stockInput}
                            onChange={(e) => setStockInput(e.target.value)}
                            placeholder="0"
                            min="0"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') saveStock(); if (e.key === 'Escape') setEditingStock(false); }}
                            className="w-full text-2xl sm:text-3xl font-black text-slate-900 bg-white border-2 border-sky-400 rounded-xl px-3 py-2 focus:outline-none focus:border-sky-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveStock}
                              disabled={savingStock}
                              className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              {savingStock ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingStock(false)}
                              className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-lg text-sm transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-4xl sm:text-5xl md:text-6xl font-black text-sky-700 font-mono">
                            {getDisplayStock(currentItem) !== null ? getDisplayStock(currentItem) : '—'}
                          </p>
                          {getDisplayStock(currentItem) !== null && getDisplayStock(currentItem)! < currentItem.quantity && (
                            <p className="mt-2 text-xs sm:text-sm font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-lg inline-block">
                              Low — less than required
                            </p>
                          )}
                          {currentItem.product_id && (
                            <div className="mt-3 sm:mt-4">
                              <button
                                onClick={openStockEditor}
                                className="text-xs font-bold text-sky-700 hover:text-sky-800 bg-sky-100 hover:bg-sky-200 px-3 py-1.5 rounded-lg border border-sky-300 transition-colors flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit Stock
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="bg-amber-50 border-2 border-amber-200 p-4 sm:p-6 rounded-3xl shadow-sm">
                      <p className="text-[10px] sm:text-xs text-amber-600 font-black uppercase tracking-widest mb-1">Shelf Location</p>
                      {editingLocation ? (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={locationInput}
                            onChange={(e) => setLocationInput(e.target.value)}
                            placeholder="e.g. A-3-B2"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') saveLocation(); if (e.key === 'Escape') setEditingLocation(false); }}
                            className="w-full text-xl sm:text-2xl font-mono font-bold text-slate-900 bg-white border-2 border-amber-400 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveLocation}
                              disabled={savingLocation}
                              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              {savingLocation ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingLocation(false)}
                              className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-lg text-sm transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-4xl sm:text-5xl md:text-6xl font-black text-amber-700 font-mono">{getDisplayLocation(currentItem) || '—'}</p>
                          <div className="mt-3 sm:mt-4 flex items-center justify-between">
                            {getDisplayLocation(currentItem) && (
                              <p className="text-xs sm:text-sm text-amber-600 font-bold uppercase">Main Aisle A</p>
                            )}
                            {currentItem.product_id && (
                              <button
                                onClick={openLocationEditor}
                                className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg border border-amber-300 transition-colors flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit Location
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {getDisplayNotes(currentItem) && (
                    <div className="bg-rose-50 border-2 border-rose-100 p-4 rounded-2xl flex gap-3 items-center">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-rose-700 font-bold text-lg">{getDisplayNotes(currentItem)}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center space-y-4">
                <div className="text-6xl">🏁</div>
                <h3 className="text-2xl font-bold text-slate-900">No products left to pick!</h3>
                <button onClick={() => setShowSummary(true)} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">View Summary</button>
              </div>
            )}
          </div>

          <div className="bg-white border-t-2 border-slate-100 p-3 sm:p-6 grid grid-cols-12 gap-2 sm:gap-4">
            <button
              onClick={() => setShowScanner(true)}
              className="col-span-6 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black py-5 sm:py-8 rounded-[1.5rem] sm:rounded-[2rem] text-xl sm:text-3xl shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 sm:gap-3"
            >
              <span className="text-2xl sm:text-4xl">📷</span>
              SCAN
            </button>
            <button
              onClick={handlePickedManually}
              disabled={!currentItem || currentItem.picked_quantity >= currentItem.quantity}
              className="col-span-5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-5 sm:py-8 rounded-[1.5rem] sm:rounded-[2rem] text-xl sm:text-3xl shadow-xl shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 sm:gap-3"
            >
              <span className="text-2xl sm:text-4xl">✓</span>
              PICKED
            </button>
            <button
              onClick={cancelPicking}
              className="col-span-1 bg-rose-100 hover:bg-rose-200 text-rose-600 font-black py-5 sm:py-8 rounded-[1.5rem] sm:rounded-[2rem] text-lg sm:text-xl transition-all uppercase"
            >
              ✕
            </button>
          </div>

          {scanWarning && (
            <div className="absolute inset-0 z-50 bg-rose-600 flex flex-col items-center justify-center text-white p-4 sm:p-8 text-center overflow-y-auto">
              <span className="text-6xl sm:text-9xl mb-4 sm:mb-8 animate-bounce">❌</span>
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-black mb-6 sm:mb-12 uppercase tracking-tighter">Wrong Product</h2>

              <div className="w-full max-w-2xl space-y-4 sm:space-y-8 bg-black/20 p-4 sm:p-8 rounded-[2rem] sm:rounded-[3rem] backdrop-blur-md">
                <div className="flex flex-col sm:flex-row justify-between items-center border-b border-white/20 pb-4 sm:pb-6 gap-2">
                  <p className="text-base sm:text-xl text-rose-200 font-bold uppercase">Expected</p>
                  <p className="text-xl sm:text-4xl font-black">{scanWarning.name}</p>
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-center border-b border-white/20 pb-4 sm:pb-6 gap-2">
                  <p className="text-base sm:text-xl text-rose-200 font-bold uppercase">Barcode</p>
                  <p className="text-lg sm:text-4xl font-mono break-all">{scanWarning.expected}</p>
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
                  <p className="text-base sm:text-xl text-rose-200 font-bold uppercase">Scanned</p>
                  <p className="text-lg sm:text-4xl font-mono bg-white text-rose-600 px-4 py-1 rounded-xl break-all">{scanWarning.scanned}</p>
                </div>
              </div>

              <button
                onClick={() => setScanWarning(null)}
                className="mt-8 sm:mt-16 bg-white text-rose-600 font-black px-8 sm:px-16 py-4 sm:py-6 rounded-[1.5rem] sm:rounded-[2rem] text-xl sm:text-3xl shadow-2xl active:scale-95 transition-all"
              >
                TRY AGAIN
              </button>
            </div>
          )}
        </main>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(decodedText) => {
            handleScan(decodedText);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

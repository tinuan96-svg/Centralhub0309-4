'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { WarehouseService } from '@/lib/services/warehouseService';
import { PackingMaterial, PackingMaterialService } from '@/lib/services/packingMaterialService';
import { BoxRecommendationService, BoxRecommendation } from '@/lib/services/packing/boxRecommendationService';
import ProductImage from '@/components/ProductImage';
import dynamic from 'next/dynamic';
import { OrderWithItems } from '@/lib/types';
import { pushOrderStatusToStore } from '@/lib/utils/orderStatusSync';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

export default function PackingVerificationClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // Packing Materials
  const [availableMaterials, setAvailableMaterials] = useState<PackingMaterial[]>([]);
  const [usedMaterials, setUsedMaterials] = useState<{ materialId: string; quantity: number }[]>([]);
  const [recommendation, setRecommendation] = useState<BoxRecommendation | null>(null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', id)
        .single();

      if (orderError) throw orderError;

      // Fallback: If order_items table is empty, try to use the JSONB items column on the orders table
      let items = orderData.order_items || [];
      if (items.length === 0 && Array.isArray(orderData.items) && orderData.items.length > 0) {
        items = orderData.items.map((it: any, idx: number) => ({
          id: it.id || `${orderData.id}-json-${idx}`,
          order_id: orderData.id,
          product_id: it.product_id,
          product_name: it.name || it.product_name || 'Unknown Product',
          product_image: it.image || it.product_image || null,
          quantity: it.quantity || 1,
          verified_quantity: it.verified_quantity || 0,
          sku: it.sku || null,
          brand: it.brand || null,
          weight: it.weight || null,
          unit: it.unit || null
        }));
      }

      setOrder({
        ...orderData,
        items
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();

    // Fetch materials
    PackingMaterialService.getAllMaterials().then(setAvailableMaterials);

    // Fetch recommendation
    BoxRecommendationService.recommendBox(id).then(setRecommendation);

    // Start packing if not already
    const initPacking = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('orders').update({
        order_status: 'packing',
        warehouse_status: 'packing',
        packing_started_at: new Date().toISOString()
      }).eq('id', id).neq('order_status', 'packing');

      // Sync status to remote store
      pushOrderStatusToStore(id, 'packing', 'Packing started');

      await WarehouseService.logAction({
        orderId: id,
        action: 'PACKING_STARTED',
        userId: user.id
      });
    };

    initPacking();
  }, [id, fetchOrder]);

  const handleScan = async (barcode: string) => {
    if (!order) return;
    setError(null);
    setSuccess(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const result = await WarehouseService.verifyBarcode({
      orderId: order.id,
      barcode: barcode.trim(),
      userId: user.id
    });

    if (result.success) {
      setSuccess(`Verified: ${result.item.product_name}`);
      fetchOrder();

      if (typeof window !== 'undefined' && window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }
    } else {
      setError(result.error || 'Verification failed');
      if (typeof window !== 'undefined' && window.navigator.vibrate) {
        window.navigator.vibrate([200, 100, 200]);
      }
    }
  };

  const finishPacking = async () => {
    setCompleting(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const materialsToSave = usedMaterials.map(um => {
        const mat = availableMaterials.find(m => m.id === um.materialId);
        return {
          materialId: um.materialId,
          quantity: um.quantity,
          costPerUnit: mat?.purchase_cost_per_unit || 0
        };
      });

      const result = await WarehouseService.completePacking({
        orderId: id,
        userId: user.id,
        materials: materialsToSave
      });

      if (result.success) {
        router.push('/packing');
      } else {
        setError(result.error || 'Failed to complete packing');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  };

  if (loading && !order) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  if (!order) return <div className="p-8 text-white text-center">Order not found</div>;

  const totalNeeded = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const totalVerified = order.items.reduce((sum, i) => sum + (i.verified_quantity || 0), 0);
  const isFullyVerified = totalVerified >= totalNeeded;

  return (
    <div className="h-full bg-slate-950 text-white flex flex-col pt-safe-top overflow-hidden">
      {/* Sticky Header */}
      <header className="px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
         <div className="flex justify-between items-start">
            <div>
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Packing Verification</p>
               <h1 className="text-xl font-black text-white uppercase">#{order.order_number}</h1>
            </div>
            <button onClick={() => router.push('/packing')} className="text-slate-500 font-bold text-xs uppercase bg-slate-800 px-3 py-1.5 rounded-lg">
               Cancel
            </button>
         </div>

         {/* Overall Progress */}
         <div className="mt-4 space-y-2">
            <div className="flex justify-between items-end">
               <p className="text-sm font-black text-orange-400">Progress: {totalVerified} / {totalNeeded} Units</p>
               <p className="text-[10px] text-slate-500 font-bold uppercase">{Math.round((totalVerified / totalNeeded) * 100)}% Complete</p>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
               <div
                 className="h-full bg-orange-500 transition-all duration-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]"
                 style={{ width: `${(totalVerified / totalNeeded) * 100}%` }}
               />
            </div>
         </div>
      </header>

      {/* Main Verification View */}
      <main className="flex-1 p-4 space-y-6 overflow-y-auto overscroll-contain">

         {/* Feedback Area */}
         {(error || success) && (
           <div className="px-2">
             {error && (
               <div className="bg-rose-500 text-white p-4 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300 shadow-lg shadow-rose-900/20">
                  <span className="text-2xl">❌</span>
                  <p className="font-black uppercase text-xs leading-tight">{error}</p>
               </div>
             )}
             {success && (
               <div className="bg-emerald-600 text-white p-4 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300 shadow-lg shadow-emerald-900/20">
                  <span className="text-2xl">✓</span>
                  <p className="font-black uppercase text-xs leading-tight">{success}</p>
               </div>
             )}
           </div>
         )}

         {/* Product List for Verification */}
         <div className="space-y-3">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] px-2">Order Content</p>
            {order.items.map(item => {
              const done = (item.verified_quantity || 0) >= item.quantity;
              return (
                <div key={item.id} className={`p-4 rounded-2xl border transition-all ${done ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-900 border-slate-800'}`}>
                   <div className="flex gap-4">
                      <div className="w-16 h-16 rounded-xl bg-white overflow-hidden flex-shrink-0 p-1">
                         <ProductImage imageUrl={item.product_image} alt={item.product_name} />
                      </div>
                      <div className="min-w-0 flex-1">
                         <h3 className={`text-sm font-black uppercase leading-tight ${done ? 'text-emerald-400 line-through' : 'text-slate-100'}`}>
                            {item.product_name}
                         </h3>
                         <div className="flex items-center gap-2 mt-2">
                            <span className="text-[9px] font-mono text-slate-500 font-bold uppercase">{item.sku || 'No SKU'}</span>
                            {done && <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase">Verified</span>}
                         </div>
                      </div>
                      <div className="text-right">
                         <p className={`text-xl font-black ${done ? 'text-emerald-400' : 'text-slate-100'}`}>
                            {item.verified_quantity || 0} <span className="text-slate-600 text-xs">/ {item.quantity}</span>
                         </p>
                         <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Units</p>
                      </div>
                   </div>
                </div>
              );
            })}
         </div>

         {/* Materials Section */}
         <div className="space-y-4 pt-6">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] px-2 flex justify-between items-center">
               <span>Packing Materials</span>
               <span className="text-orange-400">Add boxes / filler</span>
            </p>

            {recommendation && (
               <div className="mx-2 p-4 bg-cyan-900/20 border border-cyan-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="flex items-center gap-3">
                     <span className="text-2xl">💡</span>
                     <div>
                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Recommended Box</p>
                        <p className="text-sm font-bold text-white uppercase">{recommendation.box.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                           Estimated {recommendation.utilization}% volume utilization
                        </p>
                     </div>
                     <button
                       onClick={() => {
                          setUsedMaterials(prev => {
                             const exists = prev.find(um => um.materialId === recommendation.box.id);
                             if (exists) return prev;
                             return [...prev, { materialId: recommendation.box.id, quantity: 1 }];
                          });
                       }}
                       className="ml-auto px-3 py-1.5 bg-cyan-600 text-white text-[10px] font-black uppercase rounded-lg shadow-lg"
                     >
                        Apply
                     </button>
                  </div>
               </div>
            )}

            <div className="grid gap-3">
               {availableMaterials.filter(m => m.is_active).map(mat => {
                 const used = usedMaterials.find(um => um.materialId === mat.id);
                 return (
                   <div key={mat.id} className={`p-4 rounded-2xl border transition-all ${used ? 'bg-blue-950/20 border-blue-500/30' : 'bg-slate-900 border-slate-800'}`}>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="text-xl">{mat.category === 'box' ? '📦' : mat.category === 'label' ? '🏷️' : '☁️'}</span>
                            <div>
                               <p className="text-sm font-bold">{mat.name}</p>
                               <p className="text-[10px] text-slate-500 uppercase font-bold">{mat.size || mat.category}</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-4">
                            {used && used.quantity > 0 && (
                              <button
                                onClick={() => setUsedMaterials(prev => prev.map(um => um.materialId === mat.id ? { ...um, quantity: Math.max(0, um.quantity - 1) } : um))}
                                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-xl"
                              >
                                -
                              </button>
                            )}
                            <span className={`text-lg font-black ${used && used.quantity > 0 ? 'text-white' : 'text-slate-600'}`}>
                               {used?.quantity || 0}
                            </span>
                            <button
                              onClick={() => {
                                setUsedMaterials(prev => {
                                  const exists = prev.find(um => um.materialId === mat.id);
                                  if (exists) return prev.map(um => um.materialId === mat.id ? { ...um, quantity: um.quantity + 1 } : um);
                                  return [...prev, { materialId: mat.id, quantity: 1 }];
                                });
                              }}
                              className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-xl"
                            >
                               +
                            </button>
                         </div>
                      </div>
                   </div>
                 );
               })}
            </div>
         </div>
      </main>

      {/* Floating Action Area */}
      <footer className="p-6 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 shrink-0 pb-safe">
         {isFullyVerified ? (
           <button
             onClick={finishPacking}
             disabled={completing}
             className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-[2rem] text-xl shadow-2xl shadow-emerald-900/40 active:scale-95 transition-all flex items-center justify-center gap-3"
           >
             {completing ? (
               <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
             ) : (
               <>
                 <span>✓</span>
                 <span>COMPLETE PACKING</span>
               </>
             )}
           </button>
         ) : (
           <button
             onClick={() => setShowScanner(true)}
             className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-5 rounded-[2rem] text-xl shadow-2xl shadow-orange-900/40 active:scale-95 transition-all flex items-center justify-center gap-4"
           >
             <span className="text-2xl">📷</span>
             <span>SCAN BARCODE</span>
           </button>
         )}
      </footer>

      {showScanner && (
        <BarcodeScanner
          onScan={(code) => {
            handleScan(code);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

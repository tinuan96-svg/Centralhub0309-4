'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InventoryManagementService } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';
import { supabase } from '@/lib/supabase';

type MovementGroup = 'all' | 'order' | 'adjustment' | 'receipt' | 'writeoff' | 'transfer';

const groupMatches = (group: MovementGroup, actionType: string) => {
  if (group === 'all') return true;
  const action = String(actionType || '').toUpperCase();
  if (group === 'order') return ['SALE', 'DEDUCT', 'RESTORE', 'REFUND'].includes(action);
  if (group === 'adjustment') return ['MANUAL_ADJUSTMENT', 'ADJUST'].includes(action);
  if (group === 'receipt') return ['PURCHASE', 'RETURN', 'INITIAL_STOCK'].includes(action);
  if (group === 'writeoff') return ['DAMAGE', 'EXPIRED'].includes(action);
  if (group === 'transfer') return action === 'WAREHOUSE_TRANSFER';
  return true;
};

export default function MovementsClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState<MovementGroup>('all');
  const [searchProduct, setSearchProduct] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const loadMetadata = useCallback(async () => {
    const { data, error: warehouseError } = await supabase.from('warehouses').select('id, name, code, is_active').order('name');
    if (warehouseError) console.error('[StockLedger] warehouse metadata failed:', warehouseError.message);
    setWarehouses(data || []);
  }, []);

  const loadMovements = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      setMovements(await InventoryManagementService.getMovements({ limit: 500 }));
    } catch (loadError: any) {
      console.error(loadError);
      setError(loadError?.message || 'Unable to load inventory movements.');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovements(true);
    loadMetadata();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel('stock-ledger-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_movements' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => loadMovements(false), 250);
      })
      .subscribe();
    const fallback = setInterval(() => loadMovements(false), 30000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [loadMovements, loadMetadata]);

  const warehouseById = useMemo(() => new Map(warehouses.map(warehouse => [warehouse.id, warehouse])), [warehouses]);

  const filteredMovements = useMemo(() => movements.filter(movement => {
    const query = searchProduct.trim().toLowerCase();
    const name = String(movement.product_name || '').toLowerCase();
    const sku = String(movement.sku || '').toLowerCase();
    const order = String(movement.order_number || '').toLowerCase();
    if (query && !name.includes(query) && !sku.includes(query) && !order.includes(query)) return false;
    if (!groupMatches(filterType, movement.action_type)) return false;
    if (filterWarehouse !== 'all' && movement.warehouse_id !== filterWarehouse) return false;
    if (filterDate && new Date(movement.created_at).toISOString().slice(0, 10) !== filterDate) return false;
    return true;
  }), [movements, searchProduct, filterType, filterWarehouse, filterDate]);

  const clearFilters = () => { setSearchProduct(''); setFilterType('all'); setFilterWarehouse('all'); setFilterDate(''); };
  const warehouseLabel = (movement: any) => movement.warehouse_id ? (warehouseById.get(movement.warehouse_id)?.code || warehouseById.get(movement.warehouse_id)?.name || 'Assigned') : 'Unassigned';

  return <main className="mx-auto max-w-[1700px] min-w-0 space-y-5 p-4 pb-24 fold-inner:p-5 fold-inner:pb-8 lg:p-6 print:bg-white print:text-black">
    <header className="flex flex-col gap-3 fold-inner:flex-row fold-inner:items-center fold-inner:justify-between print:hidden">
      <div><h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Stock Ledger (Audit Trail)</h1><p className="text-sm text-slate-500 mt-1">Permanent inventory movement record with product, warehouse, order and adjustment references</p></div>
      <div className="flex gap-2"><button onClick={() => loadMovements(false)} className="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">↻ Refresh</button><button onClick={() => window.print()} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded-lg border border-slate-700">Print / Save PDF</button></div>
    </header>

    <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 fold-inner:grid-cols-2 xl:grid-cols-4 gap-3 shadow-lg print:hidden">
      <div className="relative"><input type="text" placeholder="Filter product, SKU or order..." value={searchProduct} onChange={event => setSearchProduct(event.target.value)} className="w-full pl-9 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span></div>
      <select value={filterType} onChange={event => setFilterType(event.target.value as MovementGroup)} className="bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300 px-4 py-3"><option value="all">All Transactions</option><option value="order">Order Movements</option><option value="adjustment">Manual Adjustments</option><option value="receipt">Receipts & Returns</option><option value="writeoff">Damage & Expiry</option><option value="transfer">Warehouse Transfers</option></select>
      <select value={filterWarehouse} onChange={event => setFilterWarehouse(event.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300 px-4 py-3"><option value="all">All Warehouses</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code || warehouse.name}</option>)}</select>
      <div className="flex gap-2"><input type="date" value={filterDate} onChange={event => setFilterDate(event.target.value)} className="min-w-0 flex-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-4 py-3" />{(searchProduct || filterType !== 'all' || filterWarehouse !== 'all' || filterDate) && <button onClick={clearFilters} className="px-3 rounded-xl bg-rose-500/10 text-rose-300 text-xs font-bold">Clear</button>}</div>
    </section>

    <div className="flex items-center justify-between gap-3 text-xs text-slate-500 print:text-black"><span>{filteredMovements.length.toLocaleString()} ledger entries</span><span>Newest first</span></div>

    <section className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl print:border-slate-300 print:bg-white">
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm print:min-w-0 print:text-black"><thead className="bg-slate-800/50 border-b border-slate-700/50 print:bg-slate-100 print:border-slate-300"><tr>
        <th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">Timestamp</th><th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">Product / Catalog</th><th className="px-4 py-4 text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">Movement</th><th className="px-4 py-4 text-right text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">Prev</th><th className="px-4 py-4 text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">Change</th><th className="px-4 py-4 text-right text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">New</th><th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">Audit Note / Ref</th>
      </tr></thead><tbody className="divide-y divide-slate-800/50 print:divide-slate-200">
        {loading && <tr><td colSpan={7} className="px-4 py-20 text-center text-slate-400">Loading ledger entries...</td></tr>}
        {error && !loading && <tr><td colSpan={7} className="px-4 py-20 text-center"><p className="text-rose-300 mb-3">{error}</p><button onClick={() => loadMovements(true)} className="px-5 py-2 bg-cyan-600 text-white rounded-lg print:hidden">Retry</button></td></tr>}
        {!loading && !error && filteredMovements.map(movement => <tr key={movement.id} className="hover:bg-slate-800/20 print:text-black">
          <td className="px-4 py-4 whitespace-nowrap"><p className="text-slate-200 text-xs font-mono print:text-black">{new Date(movement.created_at).toLocaleDateString('en-GB')}</p><p className="text-[10px] text-slate-500 font-mono">{new Date(movement.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p></td>
          <td className="px-4 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden print:hidden"><ProductImage imageUrl={movement.image_url} size="thumb" alt={movement.product_name || 'Product'} /></div><div><p className="font-bold text-slate-200 print:text-black">{movement.product_name || 'Unknown Product'}</p><p className="text-[10px] text-slate-500 font-mono uppercase">{movement.sku || '—'}</p></div></div></td>
          <td className="px-4 py-4 text-center"><span className={`inline-flex px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${Number(movement.change_amount) < 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'} print:text-black print:border-slate-400`}>{String(movement.action_type || 'UNKNOWN').replaceAll('_', ' ')}</span></td>
          <td className="px-4 py-4 text-right text-slate-500 font-mono font-bold">{movement.old_stock}</td><td className={`px-4 py-4 text-center font-black font-mono text-base ${Number(movement.change_amount) < 0 ? 'text-rose-400' : 'text-emerald-400'} print:text-black`}>{Number(movement.change_amount) > 0 ? '▲' : Number(movement.change_amount) < 0 ? '▼' : '•'} {Math.abs(Number(movement.change_amount || 0))}</td><td className="px-4 py-4 text-right text-slate-100 font-black font-mono text-base print:text-black">{movement.new_stock}</td>
          <td className="px-4 py-4 max-w-sm"><p className="text-slate-300 text-xs font-medium leading-snug print:text-black">{movement.notes || '—'}</p><div className="flex flex-wrap gap-2 mt-2 text-[8px] uppercase font-bold text-slate-600">{movement.order_number && <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-500 rounded border border-cyan-500/20 print:text-black">Order: {movement.order_number}</span>}<span>{warehouseLabel(movement)}</span></div></td>
        </tr>)}
        {!loading && !error && filteredMovements.length === 0 && <tr><td colSpan={7} className="px-4 py-20 text-center text-slate-500">No ledger entries match the selected filters.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}

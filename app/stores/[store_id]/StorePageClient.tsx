'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { StoreStatsService, StoreStats } from '@/lib/services/storeStatsService';
import { StoreService } from '@/lib/services/storeService';
import { OrderService } from '@/lib/services/orderService';
import { InventoryService } from '@/lib/services/inventoryService';
import { Store as StoreType, OrderWithItems, InventoryWithProduct, OrderStatus } from '@/lib/types';
import StoreBadge from '@/components/StoreBadge';
import DeleteStoreModal from '@/components/DeleteStoreModal';
import ProductViewPanel from '@/components/ProductViewPanel';
import Link from 'next/link';

type TabType = 'overview' | 'orders' | 'inventory';

export default function StorePageClient() {
  const params = useParams();
  const storeId = params.store_id as string;
  const { setSelectedStore } = useStore();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [store, setStore] = useState<StoreType | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [inventory, setInventory] = useState<InventoryWithProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [maxDisplayStock, setMaxDisplayStock] = useState(5);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStoreData = useCallback(async () => {
    setIsLoading(true);
    const [storeStats, storeData] = await Promise.all([
      StoreStatsService.getStoreStats(storeId),
      StoreService.getStoreById(storeId),
    ]);
    setStats(storeStats);
    setStore(storeData);
    if (storeData) {
      setMaxDisplayStock(storeData.max_display_stock || 5);
      setSelectedStore({ id: storeData.id, name: storeData.name, slug: storeData.slug, max_display_stock: storeData.max_display_stock, created_at: storeData.created_at });
    }
    setIsLoading(false);
  }, [storeId, setSelectedStore]);

  useEffect(() => { if (storeId && storeId !== 'new') loadStoreData(); }, [storeId, loadStoreData]);

  const loadTabData = useCallback(async () => {
    if (!store) return;
    if (activeTab === 'orders') {
      const { orders: rows } = await OrderService.getAllOrders({ storeId });
      setOrders(rows);
    } else if (activeTab === 'inventory') {
      setInventory(await InventoryService.getAllInventory());
    }
  }, [activeTab, store, storeId]);

  useEffect(() => { loadTabData(); }, [loadTabData]);

  const filteredOrders = orders.filter(o => o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) || o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredInventory = inventory.filter(i => i.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
  const formatCurrency = (amount: number) => `£${Number(amount).toFixed(2)}`;
  const formatDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const statusClass = (status: OrderStatus) => status === 'delivered' || status === 'completed' ? 'bg-green-100 text-green-800' : status === 'cancelled' || status === 'refunded' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';

  const saveMaxDisplayStock = async () => {
    setIsSavingSettings(true);
    try { await StoreService.updateStore(storeId, { max_display_stock: maxDisplayStock }); await loadStoreData(); }
    finally { setIsSavingSettings(false); }
  };

  if (isLoading || !stats || !store) return <div className="flex items-center justify-center h-screen text-slate-400">Loading store…</div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4"><h1 className="text-3xl font-bold text-gray-900">{stats.storeName}</h1><StoreBadge store={{ name: stats.storeName, slug: stats.storeSlug }} size="md" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><Stat label="Central Products" value={stats.activeProducts} sub={`of ${stats.totalProducts}`} /><Stat label="Orders" value={stats.totalOrders} sub={`${stats.pendingOrders} pending`} /><Stat label="Revenue" value={formatCurrency(stats.totalRevenue)} /><Stat label="Stock Alerts" value={stats.lowStockCount + stats.outOfStockCount} sub={`${stats.lowStockCount} low · ${stats.outOfStockCount} out`} /></div>
      </div>

      <div className="border-b border-gray-200 mb-6"><nav className="flex gap-8">{(['overview','orders','inventory'] as TabType[]).map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-4 px-1 border-b-2 text-sm font-medium capitalize ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>{tab}</button>)}</nav></div>

      {activeTab === 'overview' && <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6"><h2 className="text-xl font-bold text-gray-900 mb-2">Store Operations</h2><p className="text-sm text-gray-700">Products are mastered in CentralHub and propagated to the separate store database. This store record no longer maintains a duplicate product table.</p><div className="flex gap-3 mt-4"><Link href="/inventory" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium">Open Central Products</Link><Link href={`/stores/${storeId}/images`} className="px-4 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 font-medium">Store Images</Link></div></div>
        <div className="bg-white rounded-lg border border-gray-200 p-6"><h2 className="text-lg font-bold text-gray-900 mb-1">Stock Display</h2><p className="text-sm text-gray-600 mb-4">Store display setting only; it does not create or maintain store-level product inventory.</p><div className="flex gap-3 items-end max-w-md"><label className="flex-1"><span className="block text-sm font-medium text-gray-700 mb-2">Max Display Stock</span><input type="number" min="1" max="100" value={maxDisplayStock} onChange={e => setMaxDisplayStock(parseInt(e.target.value) || 5)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" /></label><button onClick={saveMaxDisplayStock} disabled={isSavingSettings} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">{isSavingSettings ? 'Saving…' : 'Save'}</button></div></div>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6"><h2 className="text-xl font-bold text-red-900 mb-2">Danger Zone</h2><p className="text-sm text-red-800 mb-4">Permanently remove this store record and its associated store data.</p><button onClick={() => setShowDeleteModal(true)} className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-bold">Delete Store</button></div>
      </div>}

      {activeTab !== 'overview' && <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…" className="w-full mb-6 px-4 py-2 border border-gray-300 rounded-lg" />}
      {activeTab === 'orders' && <TableEmpty rows={filteredOrders.length}><table className="w-full"><thead className="bg-gray-50"><tr><Th>Order</Th><Th>Customer</Th><Th>Total</Th><Th>Status</Th><Th>Date</Th></tr></thead><tbody className="divide-y divide-gray-200">{filteredOrders.map(o => <tr key={o.id}><Td>{o.order_number}</Td><Td>{o.customer_name}</Td><Td>{formatCurrency(o.total)}</Td><Td><span className={`px-2 py-1 rounded-full text-xs ${statusClass(o.order_status)}`}>{o.order_status}</span></Td><Td>{formatDate(o.created_at)}</Td></tr>)}</tbody></table></TableEmpty>}
      {activeTab === 'inventory' && <TableEmpty rows={filteredInventory.length}><table className="w-full"><thead className="bg-gray-50"><tr><Th>Product</Th><Th>Central Stock</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody className="divide-y divide-gray-200">{filteredInventory.map(i => <tr key={i.product_id}><Td>{i.product_name}</Td><Td>{i.stock_quantity}</Td><Td>{i.stock_status}</Td><Td><button onClick={() => setViewingProductId(i.product_id)} className="text-blue-600 font-medium">View product</button></Td></tr>)}</tbody></table></TableEmpty>}

      {showDeleteModal && <DeleteStoreModal storeId={storeId} storeName={stats.storeName} onClose={() => setShowDeleteModal(false)} />}
      <ProductViewPanel productId={viewingProductId} onClose={() => setViewingProductId(null)} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) { return <div className="bg-white rounded-lg border border-gray-200 p-4"><p className="text-sm text-gray-500 mb-1">{label}</p><p className="text-2xl font-bold text-gray-900">{value}</p>{sub && <p className="text-xs text-gray-400">{sub}</p>}</div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-6 py-4 text-sm text-gray-700">{children}</td>; }
function TableEmpty({ rows, children }: { rows: number; children: React.ReactNode }) { return <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">{rows ? children : <p className="p-10 text-center text-gray-500">No records found.</p>}</div>; }

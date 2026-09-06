'use client';

import { useEffect, useState } from 'react';
import { InventoryManagementService } from '@/lib/services/inventory/inventoryManagementService';
import { supabase } from '@/lib/supabase';

export default function WarehousesClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newWh, setNewWh] = useState({ name: '', code: '', location: '' });

  useEffect(() => { loadWarehouses(); }, []);

  const loadWarehouses = async () => {
    setLoading(true);
    const data = await InventoryManagementService.getWarehouses();
    setWarehouses(data);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newWh.name || !newWh.code) return;
    const { error } = await supabase.from('warehouses').insert([newWh]);
    if (error) alert(error.message);
    else { setNewWh({ name: '', code: '', location: '' }); setIsAdding(false); loadWarehouses(); }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading Warehouses...</div>;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">Warehouse Management</h1>
        <button onClick={() => setIsAdding(true)} className="px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg font-bold hover:bg-cyan-500 transition-all">+ Add Warehouse</button>
      </div>

      {warehouses.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-12 text-center">
          <p className="text-slate-400 mb-4">No warehouses configured or table missing.</p>
          <p className="text-xs text-slate-600 mb-6 italic">If you just added the migration, please run the SQL in your Supabase dashboard.</p>
          <button onClick={() => setIsAdding(true)} className="px-6 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-all font-bold">Initialize First Warehouse</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {warehouses.map(w => (
            <div key={w.id} className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 hover:border-slate-700 transition-all">
               <div className="flex items-center justify-between mb-4"><span className="text-[10px] font-black bg-slate-800 text-slate-400 px-2 py-0.5 rounded uppercase tracking-widest">{w.code}</span><span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span></div>
               <h3 className="text-lg font-bold text-slate-100 mb-1">{w.name}</h3>
               <p className="text-sm text-slate-500 mb-6">{w.location}</p>
            </div>
          ))}
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-6">New Warehouse</h2>
            <div className="space-y-4">
              <input placeholder="Warehouse Name" value={newWh.name} onChange={e => setNewWh(prev => ({ ...prev, name: e.target.value }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
              <input placeholder="Code (e.g. WH-LON)" value={newWh.code} onChange={e => setNewWh(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
              <input placeholder="Location Description" value={newWh.location} onChange={e => setNewWh(prev => ({ ...prev, location: e.target.value }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            </div>
            <div className="mt-8 flex gap-3"><button onClick={handleAdd} className="flex-1 py-3 bg-cyan-600 text-white rounded-2xl font-bold hover:bg-cyan-500 transition-all">Create</button><button onClick={() => setIsAdding(false)} className="px-6 py-3 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all">Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

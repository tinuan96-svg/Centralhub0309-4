'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PackingMaterial, PackingMaterialService } from '@/lib/services/packingMaterialService';
import { formatCurrency } from '@/lib/utils/currency';
import SkeletonLoader from '@/components/SkeletonLoader';

type Tab = 'inventory' | 'transactions' | 'orders';
type FormState = {
  sku: string;
  name: string;
  category: PackingMaterial['category'];
  size: string;
  unit: string;
  unitsPerPack: string;
  unitCost: string;
  packCost: string;
  vatRate: string;
};

const blankForm = (): FormState => ({
  sku: '', name: '', category: 'box', size: '', unit: 'box', unitsPerPack: '1', unitCost: '0', packCost: '0', vatRate: '20',
});

const qty = (value: number) => {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export default function PackagingManagementClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  const [materials, setMaterials] = useState<PackingMaterial[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PackingMaterial | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, t, p, pred] = await Promise.all([
        PackingMaterialService.getAllMaterials(),
        PackingMaterialService.getTransactions(),
        PackingMaterialService.getPurchaseOrders(),
        PackingMaterialService.getUsagePredictions(),
      ]);
      setMaterials(m);
      setTransactions(t);
      setPOs(p);
      setPredictions(pred);
    } catch (e: any) {
      console.error('[Packaging] load failed', e);
      setError(e?.message || 'Packaging data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setModalOpen(true);
  };

  const openEdit = (material: PackingMaterial) => {
    setEditing(material);
    setForm({
      sku: material.sku || '',
      name: material.name,
      category: material.category,
      size: material.size || '',
      unit: material.unit || 'unit',
      unitsPerPack: String(material.units_per_pack || 1),
      unitCost: String(material.purchase_cost_per_unit || 0),
      packCost: String(material.pack_cost_net || 0),
      vatRate: String(material.vat_rate ?? 20),
    });
    setModalOpen(true);
  };

  const saveMaterial = async () => {
    if (!form.name.trim()) { setError('Material name is required.'); return; }
    setSaving(true);
    setError(null);
    const payload: Partial<PackingMaterial> = {
      sku: form.sku.trim() || undefined,
      name: form.name.trim(),
      category: form.category,
      size: form.size.trim() || null,
      unit: form.unit.trim() || 'unit',
      units_per_pack: Math.max(1, Number(form.unitsPerPack || 1)),
      purchase_cost_per_unit: Math.max(0, Number(form.unitCost || 0)),
      pack_cost_net: Math.max(0, Number(form.packCost || 0)),
      vat_rate: Math.max(0, Number(form.vatRate || 0)),
      is_active: true,
    };
    try {
      const result = editing
        ? await PackingMaterialService.updateMaterial(editing.id, payload)
        : await PackingMaterialService.createMaterial(payload);
      if (!result.success) throw new Error(result.error || 'Material could not be saved.');
      setModalOpen(false);
      setEditing(null);
      setForm(blankForm());
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'Material could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const icon = (category: string) => category === 'box' ? '📦' : category === 'filler' ? '☁️' : category === 'tape' ? '🩹' : category === 'label' ? '🏷️' : '🛠️';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Packaging Materials</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Live stock from supplier purchases minus order usage</p>
        </div>
        <button onClick={openAdd} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-cyan-900/20 transition-all active:scale-95">+ Add Material</button>
      </header>

      {error && <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"><strong>Packaging data:</strong> {error}<button className="ml-3 underline" onClick={() => void loadData()}>Retry</button></div>}

      {!loading && !error && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Summary label="Materials" value={materials.length} />
        <Summary label="Units Purchased" value={qty(materials.reduce((s, m) => s + m.opening_stock, 0))} />
        <Summary label="Units Used" value={qty(materials.reduce((s, m) => s + m.used_stock, 0))} />
        <Summary label="Units Remaining" value={qty(materials.reduce((s, m) => s + m.current_stock, 0))} />
      </div>}

      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-2xl border border-slate-800/50 w-fit max-w-full overflow-x-auto">
        {[
          { id: 'inventory', label: 'Inventory', icon: '📋' },
          { id: 'transactions', label: 'Activity', icon: '🔄' },
          { id: 'orders', label: 'Material POs', icon: '📝' },
        ].map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-800 text-white shadow-lg border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}><span>{tab.icon}</span>{tab.label}</button>)}
      </div>

      {loading ? <SkeletonLoader variant="list" count={5} /> : !error && <div className="space-y-6">
        {activeTab === 'inventory' && (materials.length === 0 ? <Empty text="No packaging materials found." /> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.map((m) => {
            const prediction = predictions[m.id];
            const daysRemaining = prediction?.daysRemaining;
            const isOut = m.current_stock <= 0;
            return <div key={m.id} className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl hover:border-slate-700 transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl">{icon(m.category)}</div><div><h3 className="font-bold text-slate-100">{m.name}</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{m.category} • {m.size || 'Standard'}</p>{m.supplier_name && <p className="text-[9px] text-slate-600 mt-1">{m.supplier_name}</p>}</div></div>
                {isOut && <span className="px-2 py-0.5 bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-[9px] font-black uppercase">Out of Stock</span>}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3"><Metric label="Remaining" value={`${qty(m.current_stock)} ${m.unit}`} /><Metric label="Unit Cost Net" value={formatCurrency(m.purchase_cost_per_unit)} /></div>
              <div className="grid grid-cols-2 gap-3 mb-3"><Metric label="Purchased" value={qty(m.opening_stock)} /><Metric label="Allocated / Used" value={qty(m.used_stock)} /></div>
              {m.category === 'box' && m.internal_length && <p className="text-[9px] font-mono text-slate-500 mb-3">📏 {m.internal_length.toFixed(1)} × {m.internal_width?.toFixed(1)} × {m.internal_height?.toFixed(1)} cm</p>}
              {daysRemaining !== undefined && daysRemaining < 999 && <p className="text-[9px] text-slate-500 mb-3">30-day usage estimate: ~{daysRemaining} days remaining</p>}
              <div className="flex gap-2"><button onClick={() => openEdit(m)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-black uppercase">Edit</button><button onClick={() => window.location.assign('/inventory-management/purchase-orders')} className="flex-1 py-2 bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 rounded-lg text-[10px] font-black uppercase">Order More</button></div>
            </div>;
          })}
        </div>)}

        {activeTab === 'transactions' && (transactions.length === 0 ? <Empty text="No packaging purchase or usage activity found." /> : <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest"><tr><th className="px-6 py-4 text-left">Date</th><th className="px-6 py-4 text-left">Material</th><th className="px-6 py-4 text-left">Type</th><th className="px-6 py-4 text-right">Quantity</th><th className="px-6 py-4 text-left">Reference</th></tr></thead><tbody className="divide-y divide-slate-800/50">{transactions.map((t) => <tr key={t.id} className="hover:bg-slate-800/30"><td className="px-6 py-4 text-slate-300 text-xs">{new Date(t.created_at).toLocaleString()}</td><td className="px-6 py-4 font-bold text-slate-100">{t.packing_materials?.name || 'Packaging material'}</td><td className="px-6 py-4"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${t.type === 'IN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{t.type}</span></td><td className={`px-6 py-4 text-right font-black ${t.quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.quantity > 0 ? '+' : ''}{qty(t.quantity)}</td><td className="px-6 py-4 text-slate-400 text-xs">{t.reference_type?.toUpperCase()} {t.reference_id?.substring(0, 8)}</td></tr>)}</tbody></table></div></div>)}

        {activeTab === 'orders' && (pos.length === 0 ? <div className="text-center py-16 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed"><p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No Material Purchase Orders</p><p className="text-slate-600 text-xs mt-2">Supplier invoices appear in Inventory and Activity. This tab is only for genuine purchase orders.</p><button onClick={() => window.location.assign('/inventory-management/purchase-orders')} className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase">Open Purchase Orders</button></div> : <div className="space-y-4">{pos.map((po) => <div key={po.id} className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex justify-between items-center"><div><p className="font-mono text-xs text-blue-400 font-bold mb-1">{po.po_number}</p><h3 className="font-black text-white">{po.supplier_name}</h3><p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Total: {formatCurrency(po.total_cost)}</p></div><div className="text-right"><span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-slate-800 text-slate-300">{po.status}</span><p className="text-[10px] text-slate-500 mt-2">{new Date(po.created_at).toLocaleDateString()}</p></div></div>)}</div>)}
      </div>}

      {modalOpen && <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => { if (e.currentTarget === e.target && !saving) setModalOpen(false); }}><div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl"><div className="flex justify-between gap-4 mb-5"><div><h2 className="text-lg font-black text-white uppercase">{editing ? 'Edit Packaging Material' : 'Add Packaging Material'}</h2><p className="text-xs text-slate-500 mt-1">Stock comes from received supplier purchases minus order allocations.</p></div><button disabled={saving} onClick={() => setModalOpen(false)} className="text-slate-500 hover:text-white text-xl">×</button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" /></Field>
        <Field label="SKU"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Auto if blank" className="field" /></Field>
        <Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PackingMaterial['category'] })} className="field"><option value="box">Box</option><option value="filler">Filler / protective</option><option value="tape">Tape</option><option value="label">Label</option><option value="other">Other</option></select></Field>
        <Field label="Dimensions / Size"><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g. 457x305x305 mm" className="field" /></Field>
        <Field label="Unit"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="box / bag / roll" className="field" /></Field>
        <Field label="Units per Pack"><input type="number" min="1" step="1" value={form.unitsPerPack} onChange={(e) => setForm({ ...form, unitsPerPack: e.target.value })} className="field" /></Field>
        <Field label="Unit Cost Net (£)"><input type="number" min="0" step="0.0001" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} className="field" /></Field>
        <Field label="Pack Cost Net (£)"><input type="number" min="0" step="0.01" value={form.packCost} onChange={(e) => setForm({ ...form, packCost: e.target.value })} className="field" /></Field>
        <Field label="VAT %"><input type="number" min="0" step="0.01" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} className="field" /></Field>
      </div><div className="flex gap-3 mt-6"><button disabled={saving} onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold">Cancel</button><button disabled={saving || !form.name.trim()} onClick={() => void saveMaterial()} className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-600 text-white font-black disabled:opacity-50">{saving ? 'Saving…' : 'Save Material'}</button></div></div></div>}

      <style jsx>{`.field{width:100%;border:1px solid rgb(51 65 85);background:rgb(2 6 23);border-radius:.75rem;padding:.7rem .8rem;color:white;font-size:.875rem}.field:focus{outline:none;border-color:rgb(8 145 178)}`}</style>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><p className="text-[9px] uppercase tracking-widest font-black text-slate-500">{label}</p><p className="text-xl font-black text-white mt-1">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="bg-slate-800/30 p-2 rounded-lg"><p className="text-[9px] text-slate-500 font-bold uppercase">{label}</p><p className="text-base font-black text-cyan-300">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="text-center py-16 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed"><p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{text}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</span>{children}</label>; }

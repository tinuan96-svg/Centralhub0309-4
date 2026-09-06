'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { marketingService } from '@/lib/services/marketing/marketingService';
import { Badge } from '@/lib/design-system/components/Badge';
import { Promotion } from '@/lib/types/marketing';
import { supabase } from '@/lib/supabase';

type PromotionForm = {
  name: string;
  description: string;
  status: string;
  coupon_code: string;
  discount_type: string;
  discount_value: string;
  usage_limit: string;
  starts_at: string;
  ends_at: string;
};

const emptyForm = (): PromotionForm => ({
  name: '',
  description: '',
  status: 'draft',
  coupon_code: '',
  discount_type: 'percentage',
  discount_value: '',
  usage_limit: '',
  starts_at: '',
  ends_at: '',
});

export default function PromotionManager({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const { selectedStore } = useStore();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<PromotionForm>(emptyForm());
  const [message, setMessage] = useState<string | null>(null);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    try {
      setPromotions(await marketingService.getPromotions(selectedStore?.id));
    } catch (err) {
      console.error('Failed to load promotions:', err);
      setMessage('Promotions could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id]);

  useEffect(() => { loadPromotions(); }, [loadPromotions]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setMessage(null);
    setShowEditor(true);
  };

  const openEdit = (promo: Promotion) => {
    setEditing(promo);
    setForm({
      name: promo.name || '',
      description: promo.description || '',
      status: promo.status || 'draft',
      coupon_code: promo.coupon_code || '',
      discount_type: promo.discount_type || 'percentage',
      discount_value: promo.discount_value == null ? '' : String(promo.discount_value),
      usage_limit: promo.usage_limit == null ? '' : String(promo.usage_limit),
      starts_at: (promo as any).starts_at ? String((promo as any).starts_at).slice(0, 16) : '',
      ends_at: (promo as any).ends_at ? String((promo as any).ends_at).slice(0, 16) : '',
    });
    setMessage(null);
    setShowEditor(true);
  };

  const savePromotion = async () => {
    if (!selectedStore?.id) {
      setMessage('Select a specific store before creating or editing a promotion.');
      return;
    }
    if (!form.name.trim()) {
      setMessage('Promotion name is required.');
      return;
    }
    const discountValue = Number(form.discount_value);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      setMessage('Enter a valid discount value.');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        coupon_code: form.coupon_code.trim() || null,
        discount_type: form.discount_type,
        discount_value: discountValue,
        usage_limit: form.usage_limit.trim() ? Number(form.usage_limit) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      let promotionId = editing?.id;
      if (editing) {
        const { error } = await supabase.from('promotions').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('promotions').insert(payload).select('id').single();
        if (error) throw error;
        promotionId = data.id;
      }

      if (!promotionId) throw new Error('Promotion ID was not returned.');
      const { error: linkError } = await supabase.from('promotion_stores').upsert({
        promotion_id: promotionId,
        store_id: selectedStore.id,
      }, { onConflict: 'promotion_id,store_id' });
      if (linkError) throw linkError;

      setShowEditor(false);
      setEditing(null);
      setForm(emptyForm());
      setMessage('Promotion saved.');
      await loadPromotions();
    } catch (err: any) {
      console.error('Failed to save promotion:', err);
      setMessage(err?.message || 'Promotion could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <PageHeader title="Promotion Manager" subtitle="Manage discount codes, product offers and store-wide promotions." />
        <Button onClick={openNew} disabled={!selectedStore?.id}>+ New Promotion</Button>
      </div>

      {!selectedStore?.id && <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-200">Select a specific store before creating or editing promotions. Promotions are intentionally store-scoped.</div>}
      {message && <div className="p-3 rounded-xl border border-slate-700 bg-slate-900 text-xs text-slate-300">{message}</div>}

      <div className="grid gap-3">
        {loading ? <div className="p-10 text-center text-slate-500 italic">Loading promotions...</div> : promotions.length === 0 ? <div className="p-10 text-center text-slate-500 italic border border-dashed border-slate-800 rounded-2xl">No promotions found. Create one to drive conversions.</div> : promotions.map((promo) => {
          const discountType = promo.discount_type || 'discount';
          return <Card key={promo.id} className="p-4 bg-slate-900/40 border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-slate-700 transition-all">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-lg shrink-0">🏷️</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h3 className="font-bold text-slate-100 truncate">{promo.name}</h3>{promo.coupon_code && <code className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-blue-400 font-mono border border-slate-700 shrink-0">{promo.coupon_code}</code>}</div>
                <p className="text-[10px] text-slate-500 uppercase tracking-tight truncate">{discountType.replace('_', ' ')} • {promo.discount_value}{discountType === 'percentage' ? '%' : ' GBP'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-6 border-t border-slate-800 sm:border-0 pt-3 sm:pt-0">
              <div className="hidden lg:block text-right"><p className="text-[10px] text-slate-500 uppercase">Usage</p><p className="text-sm font-bold text-white">0 / {promo.usage_limit || '∞'}</p></div>
              <Badge variant={promo.status === 'active' ? 'success' : 'warning'} className="text-[10px]">{promo.status}</Badge>
              <div className="flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"><Button variant="secondary" className="text-[10px] h-8 px-3" onClick={() => openEdit(promo)} disabled={!selectedStore?.id}>Edit</Button></div>
            </div>
          </Card>;
        })}
      </div>

      {showEditor && <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-widest text-green-400">{editing ? 'Edit promotion' : 'New promotion'}</p><h2 className="text-xl font-black text-white mt-1">{selectedStore?.name || 'Store Promotion'}</h2></div>
            <button type="button" onClick={() => setShowEditor(false)} className="w-9 h-9 rounded-full bg-slate-800 text-slate-300">×</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="sm:col-span-2 text-xs text-slate-400">Name *<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white" /></label>
            <label className="sm:col-span-2 text-xs text-slate-400">Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white" /></label>
            <label className="text-xs text-slate-400">Discount type<select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
            <label className="text-xs text-slate-400">Discount value<input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white" /></label>
            <label className="text-xs text-slate-400">Coupon code<input value={form.coupon_code} onChange={e => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white font-mono" /></label>
            <label className="text-xs text-slate-400">Usage limit<input type="number" min="1" value={form.usage_limit} onChange={e => setForm({ ...form, usage_limit: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white" /></label>
            <label className="text-xs text-slate-400">Starts<input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white" /></label>
            <label className="text-xs text-slate-400">Ends<input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white" /></label>
            <label className="sm:col-span-2 text-xs text-slate-400">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white"><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
          </div>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setShowEditor(false)} disabled={saving}>Cancel</Button><Button onClick={savePromotion} disabled={saving}>{saving ? 'Saving…' : 'Save Promotion'}</Button></div>
        </div>
      </div>}
    </div>
  );
}

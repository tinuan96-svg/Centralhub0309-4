'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

const OBJECTIVES = [
  ['sales', 'Sales', '💰'],
  ['traffic', 'Traffic', '🚦'],
  ['leads', 'Leads', '📋'],
  ['awareness', 'Awareness', '📢'],
  ['engagement', 'Engagement', '✨'],
] as const;

const CHANNELS = [
  ['meta', 'Meta'], ['google', 'Google'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'],
  ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['pinterest', 'Pinterest'],
] as const;

export default function CampaignManagerLiveClient() {
  const { selectedStore } = useStore();
  const storeId = selectedStore?.id || '';
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [audiences, setAudiences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', objective: 'sales', providerId: '', channels: [] as string[], products: [] as string[], audienceId: '', budget: '', budgetType: 'lifetime', startDate: '', endDate: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let cq = supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false });
      if (storeId) cq = cq.eq('store_id', storeId);
      const [campaignRes, providerRes, productRes, audienceRes] = await Promise.all([
        cq,
        supabase.from('marketing_providers').select('id,display_name,category,icon').eq('is_active', true).order('display_name'),
        supabase.from('products').select('id,name,sku,price').eq('is_active', true).eq('is_deleted', false).order('name').limit(200),
        storeId ? supabase.from('marketing_audiences').select('id,name,size_count,status').eq('store_id', storeId).eq('status', 'active').order('name') : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (campaignRes.error) throw campaignRes.error;
      if (providerRes.error) throw providerRes.error;
      if (productRes.error) throw productRes.error;
      if (audienceRes.error) throw audienceRes.error;
      setCampaigns(campaignRes.data || []); setProviders(providerRes.data || []); setProducts(productRes.data || []); setAudiences(audienceRes.data || []);
      if (!form.providerId && providerRes.data?.[0]) setForm(f => ({ ...f, providerId: providerRes.data[0].id }));
    } catch (e: any) { setError(e?.message || 'Could not load live campaign data.'); }
    finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (key: 'channels' | 'products', value: string) => setForm(f => ({ ...f, [key]: f[key].includes(value) ? f[key].filter(x => x !== value) : [...f[key], value] }));

  const createCampaign = async () => {
    if (!storeId) return setError('Select a specific store before creating a campaign.');
    if (!form.name.trim() || !form.providerId) return setError('Campaign name and advertising provider are required.');
    setSaving(true); setError('');
    try {
      const { error: insertError } = await supabase.from('marketing_campaigns').insert({
        store_id: storeId, provider_id: form.providerId, name: form.name.trim(), status: 'draft', objective: form.objective,
        campaign_type: form.channels[0] || 'multi_channel', budget_type: form.budgetType,
        budget_amount: Number(form.budget) || 0, currency: 'GBP',
        start_date: form.startDate ? new Date(form.startDate).toISOString() : null,
        end_date: form.endDate ? new Date(form.endDate).toISOString() : null,
        targeting: { audience_id: form.audienceId || null, product_ids: form.products },
        metadata: { channels: form.channels, created_from: 'centralhub_frontend' },
      });
      if (insertError) throw insertError;
      setOpen(false); setForm(f => ({ ...f, name: '', budget: '', audienceId: '', products: [], channels: [] })); await load();
    } catch (e: any) { setError(e?.message || 'Campaign could not be saved.'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error: updateError } = await supabase.from('marketing_campaigns').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('store_id', storeId);
    if (updateError) setError(updateError.message); else await load();
  };

  const providerName = (id: string) => providers.find(p => p.id === id)?.display_name || id;
  const money = (n: any) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(n) || 0);

  return <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
    <div className="flex flex-wrap justify-between gap-4 items-start"><div><h1 className="text-3xl font-black">Campaign Manager</h1><p className="text-slate-400">Live campaigns, products and audiences from Supabase.</p></div><div className="flex gap-2"><button onClick={load} className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900">Refresh</button><button onClick={() => setOpen(true)} className="px-4 py-2 rounded-lg bg-blue-600 font-bold">+ Create Campaign</button></div></div>
    {error && <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm">{error}</div>}
    {!storeId && <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">Select a store to create campaigns and manage store-owned audiences.</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Campaigns" value={campaigns.length}/><Stat label="Active" value={campaigns.filter(c => ['active','running'].includes(c.status)).length}/><Stat label="Drafts" value={campaigns.filter(c => c.status === 'draft').length}/><Stat label="Planned budget" value={money(campaigns.reduce((s,c)=>s+Number(c.budget_amount||0),0))}/></div>
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden"><div className="px-5 py-4 border-b border-slate-800 font-bold">Live campaign records</div>{loading ? <div className="p-8 text-slate-400">Loading…</div> : campaigns.length === 0 ? <div className="p-10 text-center text-slate-500">No campaigns exist for this store yet.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-900/70"><tr>{['Name','Provider','Objective','Budget','Status','Created'].map(h=><th key={h} className="p-3 text-left text-slate-400">{h}</th>)}</tr></thead><tbody>{campaigns.map(c=><tr key={c.id} className="border-t border-slate-800"><td className="p-3 font-semibold">{c.name}</td><td className="p-3 text-slate-300">{providerName(c.provider_id)}</td><td className="p-3">{c.objective || '—'}</td><td className="p-3">{money(c.budget_amount)}</td><td className="p-3"><select value={c.status} onChange={e=>updateStatus(c.id,e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1"><option>draft</option><option>active</option><option>paused</option><option>completed</option></select></td><td className="p-3 text-slate-500">{c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '—'}</td></tr>)}</tbody></table></div>}</div>

    {open && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6 space-y-5"><div className="flex justify-between"><h2 className="text-xl font-bold">Create live campaign</h2><button onClick={()=>setOpen(false)} className="text-slate-400 text-xl">×</button></div><div className="grid md:grid-cols-2 gap-4"><Field label="Campaign name"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input" placeholder="Summer Grocery Campaign"/></Field><Field label="Provider"><select value={form.providerId} onChange={e=>setForm({...form,providerId:e.target.value})} className="input">{providers.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field></div><Field label="Objective"><div className="flex flex-wrap gap-2">{OBJECTIVES.map(([id,name,icon])=><button type="button" key={id} onClick={()=>setForm({...form,objective:id})} className={`px-3 py-2 rounded-lg border ${form.objective===id?'border-blue-500 bg-blue-500/10':'border-slate-700'}`}>{icon} {name}</button>)}</div></Field><Field label="Channels"><div className="flex flex-wrap gap-2">{CHANNELS.map(([id,name])=><button type="button" key={id} onClick={()=>toggle('channels',id)} className={`px-3 py-2 rounded-lg border ${form.channels.includes(id)?'border-blue-500 bg-blue-500/10':'border-slate-700'}`}>{name}</button>)}</div></Field><Field label="Target audience"><select value={form.audienceId} onChange={e=>setForm({...form,audienceId:e.target.value})} className="input"><option value="">No audience / broad</option>{audiences.map(a=><option key={a.id} value={a.id}>{a.name} ({a.size_count||0})</option>)}</select></Field><Field label="Products"><div className="grid md:grid-cols-2 gap-2 max-h-44 overflow-y-auto">{products.map(p=><button type="button" key={p.id} onClick={()=>toggle('products',p.id)} className={`text-left p-2 rounded-lg border ${form.products.includes(p.id)?'border-blue-500 bg-blue-500/10':'border-slate-800'}`}>{p.name}<span className="block text-xs text-slate-500">{p.sku || ''}</span></button>)}</div></Field><div className="grid md:grid-cols-3 gap-4"><Field label="Budget"><input type="number" min="0" step="0.01" value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} className="input"/></Field><Field label="Budget type"><select value={form.budgetType} onChange={e=>setForm({...form,budgetType:e.target.value})} className="input"><option value="lifetime">Lifetime</option><option value="daily">Daily</option></select></Field><Field label="Start date"><input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} className="input"/></Field></div><div className="flex justify-end gap-2"><button onClick={()=>setOpen(false)} className="px-4 py-2 rounded-lg border border-slate-700">Cancel</button><button disabled={saving} onClick={createCampaign} className="px-5 py-2 rounded-lg bg-emerald-600 font-bold">{saving?'Saving…':'Save Draft'}</button></div></div></div>}
  </div>;
}

function Stat({label,value}:{label:string;value:any}){return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="text-xl font-black mt-1">{value}</div></div>}
function Field({label,children}:{label:string;children:any}){return <label className="block space-y-2"><span className="text-xs text-slate-400 uppercase font-bold">{label}</span>{children}</label>}

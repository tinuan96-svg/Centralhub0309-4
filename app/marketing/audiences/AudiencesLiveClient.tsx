'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-blue-500';

export default function AudiencesLiveClient() {
  const { selectedStore } = useStore();
  const storeId = selectedStore?.id || '';
  const [rows, setRows] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', description: '', segmentId: '', sizeCount: '0' });

  const load = useCallback(async () => {
    if (!storeId) { setRows([]); setLoading(false); return; }
    setLoading(true); setError('');
    const [aud, seg] = await Promise.all([
      supabase.from('marketing_audiences').select('id,name,description,segment_id,rules,size_count,status,created_at,updated_at').eq('store_id', storeId).order('created_at', { ascending: false }),
      supabase.from('marketing_segments').select('id,name').eq('store_id', storeId).order('name'),
    ]);
    if (aud.error) setError(aud.error.message); else setRows(aud.data || []);
    if (seg.error) setError(seg.error.message); else setSegments(seg.data || []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditing(null); setForm({ name: '', description: '', segmentId: '', sizeCount: '0' }); };
  const save = async () => {
    if (!storeId) return setError('Select a specific store first.');
    if (!form.name.trim()) return setError('Audience name is required.');
    setSaving(true); setError('');
    const payload = { name: form.name.trim(), description: form.description.trim() || null, segment_id: form.segmentId || null, size_count: Math.max(0, Number(form.sizeCount) || 0), status: 'active', updated_at: new Date().toISOString() };
    const result = editing ? await supabase.from('marketing_audiences').update(payload).eq('id', editing.id).eq('store_id', storeId) : await supabase.from('marketing_audiences').insert({ ...payload, store_id: storeId, rules: {} });
    if (result.error) setError(result.error.message); else { reset(); await load(); }
    setSaving(false);
  };
  const edit = (r:any) => { setEditing(r); setForm({ name:r.name||'', description:r.description||'', segmentId:r.segment_id||'', sizeCount:String(r.size_count||0) }); };
  const remove = async (id:string) => { if (!confirm('Delete this audience?')) return; const { error:e } = await supabase.from('marketing_audiences').delete().eq('id',id).eq('store_id',storeId); if(e) setError(e.message); else await load(); };
  const segmentName = (id:string) => segments.find(s=>s.id===id)?.name || '—';

  return <div className="p-6 space-y-6 max-w-7xl mx-auto text-white"><div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-black">Marketing Audiences</h1><p className="text-slate-400">Store-scoped audience definitions backed by Supabase.</p></div><button onClick={()=>{reset();}} className="px-4 py-2 rounded-lg bg-blue-600 font-bold">+ New Audience</button></div>
    {error && <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300">{error}</div>}
    {!storeId && <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">Select a store to view and manage its audiences.</div>}
    {storeId && <div className="grid lg:grid-cols-[360px_1fr] gap-6"><div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4"><h2 className="font-bold">{editing?'Edit audience':'Create audience'}</h2><input className={input} placeholder="Audience name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><textarea className={input} rows={4} placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><select className={input} value={form.segmentId} onChange={e=>setForm({...form,segmentId:e.target.value})}><option value="">No source segment</option>{segments.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input className={input} type="number" min="0" value={form.sizeCount} onChange={e=>setForm({...form,sizeCount:e.target.value})} placeholder="Audience size"/><div className="flex gap-2"><button disabled={saving} onClick={save} className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 font-bold">{saving?'Saving…':editing?'Update':'Create'}</button>{editing&&<button onClick={reset} className="px-4 py-2 rounded-lg border border-slate-700">Cancel</button>}</div></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden"><div className="px-5 py-4 border-b border-slate-800 font-bold">Live audiences</div>{loading?<div className="p-8 text-slate-400">Loading…</div>:rows.length===0?<div className="p-10 text-center text-slate-500">No audiences have been created for this store.</div>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-900"><tr>{['Name','Segment','Size','Status','Actions'].map(h=><th key={h} className="p-3 text-left text-slate-400">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-slate-800"><td className="p-3 font-semibold">{r.name}<div className="text-xs text-slate-500">{r.description||''}</div></td><td className="p-3 text-slate-300">{segmentName(r.segment_id)}</td><td className="p-3">{Number(r.size_count||0).toLocaleString('en-GB')}</td><td className="p-3">{r.status}</td><td className="p-3 flex gap-2"><button onClick={()=>edit(r)} className="px-3 py-1 rounded border border-slate-700">Edit</button><button onClick={()=>remove(r.id)} className="px-3 py-1 rounded border border-red-500/40 text-red-300">Delete</button></td></tr>)}</tbody></table></div>}</div></div>}
  </div>;
}

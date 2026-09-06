'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

export default function TrackingLiveClient() {
  const { selectedStore } = useStore();
  const storeId = selectedStore?.id || '';
  const [events, setEvents] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let eq = supabase.from('marketing_events').select('id,event_type,event_source,url,referrer,utm_source,utm_medium,utm_campaign,click_id,timestamp,customer_id,order_id').order('timestamp',{ascending:false}).limit(200);
      let mq = supabase.from('marketing_metrics').select('id,date,provider_id,spend,impressions,clicks,conversions,conversion_value').order('date',{ascending:false}).limit(100);
      if (storeId) { eq = eq.eq('store_id',storeId); mq = mq.eq('store_id',storeId); }
      const [e,m] = await Promise.all([eq,mq]);
      if(e.error) throw e.error; if(m.error) throw m.error;
      setEvents(e.data||[]); setMetrics(m.data||[]);
    } catch(err:any){setError(err?.message||'Could not load tracking data.');}
    finally{setLoading(false);}
  },[storeId]);
  useEffect(()=>{load();},[load]);

  const types = useMemo(()=>['all',...Array.from(new Set(events.map(e=>e.event_type).filter(Boolean)))], [events]);
  const visible = filter==='all'?events:events.filter(e=>e.event_type===filter);
  const purchases = events.filter(e=>e.event_type==='purchase').length;
  const clicks = metrics.reduce((s,r)=>s+Number(r.clicks||0),0);
  const conversions = metrics.reduce((s,r)=>s+Number(r.conversions||0),0);
  const spend = metrics.reduce((s,r)=>s+Number(r.spend||0),0);

  return <div className="p-6 space-y-6 max-w-7xl mx-auto text-white"><div className="flex justify-between gap-4 flex-wrap"><div><h1 className="text-3xl font-black">Tracking</h1><p className="text-slate-400">Live marketing events and performance metrics from Supabase.</p></div><button onClick={load} className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900">Refresh</button></div>{error&&<div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Events" value={events.length}/><Stat label="Purchases" value={purchases}/><Stat label="Clicks" value={clicks.toLocaleString()}/><Stat label="Spend" value={`£${spend.toFixed(2)}`}/></div>
    <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden"><div className="p-4 border-b border-slate-800 flex gap-2 flex-wrap">{types.map(t=><button key={t} onClick={()=>setFilter(t)} className={`px-3 py-1 rounded-full text-xs border ${filter===t?'border-blue-500 bg-blue-500/10':'border-slate-700 text-slate-400'}`}>{t}</button>)}</div>{loading?<div className="p-8 text-slate-400">Loading…</div>:visible.length===0?<div className="p-10 text-center text-slate-500">No tracking events found.</div>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-900"><tr>{['Event','Source','Campaign','URL','Time'].map(h=><th key={h} className="p-3 text-left text-slate-400">{h}</th>)}</tr></thead><tbody>{visible.map(e=><tr key={e.id} className="border-t border-slate-800"><td className="p-3 font-semibold">{e.event_type}</td><td className="p-3">{e.event_source||'web'}</td><td className="p-3 text-slate-300">{e.utm_campaign||'—'}</td><td className="p-3 max-w-xs truncate text-slate-400">{e.url||'—'}</td><td className="p-3 text-slate-500">{e.timestamp?new Date(e.timestamp).toLocaleString('en-GB'):'—'}</td></tr>)}</tbody></table></div>}</div>
    <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden"><div className="p-4 border-b border-slate-800 font-bold">Recent performance metrics</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-900"><tr>{['Date','Provider','Spend','Impressions','Clicks','Conversions','Revenue'].map(h=><th key={h} className="p-3 text-left text-slate-400">{h}</th>)}</tr></thead><tbody>{metrics.slice(0,50).map(r=><tr key={r.id} className="border-t border-slate-800"><td className="p-3">{r.date}</td><td className="p-3">{r.provider_id}</td><td className="p-3">£{Number(r.spend||0).toFixed(2)}</td><td className="p-3">{Number(r.impressions||0).toLocaleString()}</td><td className="p-3">{Number(r.clicks||0).toLocaleString()}</td><td className="p-3">{Number(r.conversions||0).toLocaleString()}</td><td className="p-3">£{Number(r.conversion_value||0).toFixed(2)}</td></tr>)}</tbody></table></div></div>
  </div>;
}
function Stat({label,value}:{label:string;value:any}){return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="text-xl font-black mt-1">{value}</div></div>}

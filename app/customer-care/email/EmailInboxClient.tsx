'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Email = {
 id:string; source_provider:string; source_account:string|null; external_message_id:string;
 from_address:string; to_addresses:string[]; subject:string; body_text:string|null;
 attachments:{id?:string;filename?:string;content_type?:string}[]; received_at:string;
 category:string; subcategory:string|null; priority:'low'|'normal'|'high'|'critical';
 ai_summary:string|null; action_summary:string|null; detected_deadline:string|null;
 detected_amount:number|null; detected_currency:string|null; sender_verified:boolean;
 confidence:number|null; route_status:'pending'|'routed'|'needs_review'|'processed'|'failed'|'ignored';
 route_target:string|null; requires_human_approval:boolean; processing_error:string|null;
};
export default function EmailInboxClient(){
 const[messages,setMessages]=useState<Email[]>([]),[selected,setSelected]=useState<string|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
 const request=useCallback(async(method:'GET'|'PATCH',data?:object)=>{const{data:s,error:e}=await supabase.auth.getSession();if(e||!s.session?.access_token)throw new Error('Please sign in to CentralHub again.');const r=await fetch('/api/customer-care/email-inbox',{method,cache:'no-store',headers:{Authorization:'Bearer '+s.session.access_token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Unable to access email intelligence.');return j},[]);
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const j=await request('GET');const list=Array.isArray(j.messages)?j.messages as Email[]:[];setMessages(list);setSelected(old=>old&&list.some(x=>x.id===old)?old:list[0]?.id||null)}catch(e){setError(e instanceof Error?e.message:'Could not load email.')}finally{setLoading(false)}},[request]);
 useEffect(()=>{void refresh()},[refresh]);
 const update=async(state:Email['route_status'])=>{if(!selected||busy)return;setBusy(true);try{await request('PATCH',{id:selected,route_status:state});setMessages(old=>old.map(x=>x.id===selected?{...x,route_status:state}:x))}catch(e){setError(e instanceof Error?e.message:'Could not update email.')}finally{setBusy(false)}};
 const visible=useMemo(()=>messages.filter(m=>(m.subject+' '+m.from_address+' '+m.category+' '+(m.ai_summary||'')).toLowerCase().includes(query.toLowerCase())),[messages,query]);
 const current=messages.find(x=>x.id===selected)||null;const date=(v:string)=>Number.isNaN(Date.parse(v))?'Unknown time':new Date(v).toLocaleString();
 return <section className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
  <header className="shrink-0 border-b border-slate-800 bg-slate-900/90 px-3 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-2">
   <div><Link href="/customer-care/inbox" className="text-xs text-cyan-300 hover:underline">← WhatsApp inbox</Link><h1 className="text-lg font-bold">Central Email Intelligence Hub</h1><p className="text-[11px] text-slate-400">Unified email · AI classification & routing · consequential actions require approval</p></div>
   <button onClick={()=>void refresh()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">{loading?'Loading…':'Refresh'}</button>
  </header>
  {error&&<div role="alert" className="shrink-0 border-b border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-200">{error}</div>}
  <div className="flex flex-1 min-h-0 overflow-hidden">
   <aside className={(current?'hidden md:flex ':'flex ')+'w-full md:w-72 lg:w-80 shrink-0 flex-col border-r border-slate-800 min-h-0'}>
    <div className="shrink-0 border-b border-slate-800 p-3"><input aria-label="Search email" placeholder="Search sender, subject, category…" value={query} onChange={e=>setQuery(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"/></div>
    <div className="flex-1 overflow-y-auto">{visible.length===0&&<div className="p-5 text-sm text-slate-400">{loading?'Loading messages…':'No matching messages'}</div>}
     {visible.map(m=><button type="button" key={m.id} onClick={()=>setSelected(m.id)} className={'block w-full border-b border-slate-800 px-4 py-3 text-left hover:bg-slate-800/70 '+(selected===m.id?'bg-cyan-950/40':'')}>
      <div className="flex justify-between gap-2"><span className="truncate text-sm font-semibold">{m.from_address}</span><span className="shrink-0 text-[10px] text-slate-400">{date(m.received_at)}</span></div><div className="mt-1 truncate text-sm">{m.subject||'(No subject)'}</div>
      <div className="mt-1 flex gap-2 text-[10px]"><span className="text-cyan-300">{m.category}</span><span className={m.priority==='critical'?'text-red-300':m.priority==='high'?'text-amber-300':'text-slate-400'}>{m.priority}</span><span className="text-slate-500">{m.route_status}</span></div>
     </button>)}
    </div>
   </aside>
   <main className={(current?'flex ':'hidden md:flex ')+'flex-1 flex-col min-w-0 min-h-0'}>
    {current?<><div className="shrink-0 space-y-2 border-b border-slate-800 p-3 sm:p-4"><button className="md:hidden text-xs text-cyan-300" onClick={()=>setSelected(null)}>← All emails</button><h2 className="break-words text-lg font-bold">{current.subject||'(No subject)'}</h2><div className="break-all text-xs text-slate-400">From: {current.from_address}</div><div className="text-xs text-slate-400">{date(current.received_at)}</div>
     <div className="grid gap-2 sm:grid-cols-2 text-xs"><div className="rounded-lg border border-slate-800 p-2"><span className="text-slate-500">Category</span><div className="font-semibold">{current.category} · {current.priority}</div></div><div className="rounded-lg border border-slate-800 p-2"><span className="text-slate-500">Route</span><div className="font-semibold">{current.route_target||'AI review'}</div></div>{current.detected_deadline&&<div className="rounded-lg border border-amber-800 p-2"><span className="text-slate-500">Deadline</span><div>{date(current.detected_deadline)}</div></div>}{current.detected_amount!=null&&<div className="rounded-lg border border-slate-800 p-2"><span className="text-slate-500">Detected amount</span><div>{current.detected_currency||'GBP'} {current.detected_amount.toFixed(2)}</div></div>}</div>
     <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void update('processed')} className="rounded-lg bg-cyan-800 px-3 py-2 text-xs disabled:opacity-40">Mark processed</button><button disabled={busy} onClick={()=>void update('needs_review')} className="rounded-lg border border-amber-700 px-3 py-2 text-xs disabled:opacity-40">Needs review</button><span className="rounded-lg border border-slate-700 px-3 py-2 text-xs">{current.requires_human_approval?'Approval required':'Deterministic automation allowed'}</span></div>
    </div><div className="flex-1 overflow-y-auto p-4 sm:p-6">{current.ai_summary&&<div className="mb-4 rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-4"><div className="text-xs uppercase tracking-wide text-cyan-300">AI summary</div><p className="mt-1 text-sm">{current.ai_summary}</p>{current.action_summary&&<p className="mt-2 text-xs text-slate-400">{current.action_summary}</p>}</div>}<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{current.body_text||'This message has no stored plain-text body.'}</p>{current.attachments?.length>0&&<div className="mt-6 rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-100">{current.attachments.length} attachment(s) reported. Metadata is preserved; private binary ingestion remains review-gated.</div>}<p className="mt-6 text-xs text-slate-500">Automatic replies, payments, tax submissions and legal commitments remain disabled.</p></div></>:<div className="m-auto p-8 text-sm text-slate-500">Select an email to review.</div>}
   </main>
  </div>
 </section>
}
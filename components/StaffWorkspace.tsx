'use client';

import {useCallback,useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';

type Store={id:string;name:string;slug:string};
type StaffContext={full_name:string;role:string;permissions:string[];stores:Store[]};
type Section={key:string;permission:string;label:string;columns:string[]};
const sections:Section[]=[
  {key:'orders',permission:'orders.view',label:'Orders',columns:['order_number','customer_name','order_status','payment_status','total','created_at']},
  {key:'customers',permission:'customers.view',label:'Customers',columns:['name','email','phone','created_at']},
  {key:'customer_care',permission:'support.view',label:'Customer Care',columns:['subject','description','status','created_at']},
  {key:'billing',permission:'billing.view',label:'Billing',columns:['invoice_number','subject','created_at']},
  {key:'finance',permission:'finance.view',label:'Accounts',columns:['description','amount','created_at']},
  {key:'marketing',permission:'marketing.view',label:'Marketing',columns:['name','status','created_at']},
  {key:'inventory',permission:'inventory.view',label:'Inventory movements',columns:['sku','old_quantity','new_quantity','change','created_at']},
  {key:'fulfilment',permission:'fulfilment.view',label:'Picking & packing queue',columns:['order_number','order_status','created_at']},
  {key:'procurement',permission:'procurement.view',label:'Purchase orders (All Stores only)',columns:['supplier_id','status','order_date','created_at']}
];
function displayCell(value:unknown):string{
  if(value===null||value===undefined||value==='')return '—';
  if(typeof value==='number')return value.toLocaleString('en-GB');
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)){
    const d=new Date(value);
    return Number.isNaN(d.getTime())?value:d.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
  }
  return String(value);
}
const button='rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40';

export default function StaffWorkspace({session,signOut}:{session:Session;signOut:()=>Promise<void>}){
  const [context,setContext]=useState<StaffContext|null>(null);
  const [storeId,setStoreId]=useState('');
  const [section,setSection]=useState('');
  const [page,setPage]=useState(1);
  const [rows,setRows]=useState<Record<string,unknown>[]>([]);
  const [total,setTotal]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(true);
  const bearer=session.access_token;
  const granted=sections.filter(s=>context?.permissions.includes(s.permission));
  const fetchContext=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/staff/context',{
        headers:{Authorization:`Bearer ${bearer}`},cache:'no-store'
      });
      const body=await r.json();
      if(!r.ok)throw new Error(body.error||'Access verification failed');
      setContext(body as StaffContext);
      setStoreId(prev=>(body.stores as Store[]).some(s=>s.id===prev)?prev:(body.stores?.[0]?.id||''));
      setSection(prev=>sections.some(s=>s.key===prev&&body.permissions?.includes(s.permission))
        ?prev:(sections.find(s=>body.permissions?.includes(s.permission))?.key||''));
    }catch(err){setContext(null);setRows([]);setError(err instanceof Error?err.message:'Staff access is unavailable');}
    finally{setBusy(false);}
  },[bearer]);
  useEffect(()=>{void fetchContext();},[fetchContext]);
  useEffect(()=>{
    if(!context||!storeId||!section){setRows([]);setTotal(0);return;}
    let active=true;
    setBusy(true);setError('');
    void(async()=>{
      try{
        const params=new URLSearchParams({section,store_id:storeId,page:String(page)});
        const r=await fetch(`/api/staff/records?${params}`,{
          headers:{Authorization:`Bearer ${bearer}`},cache:'no-store'
        });
        const body=await r.json();
        if(!r.ok)throw new Error(body.error||'Could not read assigned records');
        if(active){setRows(body.rows||[]);setTotal(body.total||0);}
      }catch(err){if(active){setRows([]);setTotal(0);setError(err instanceof Error?err.message:'Access verification failed');}}
      finally{if(active)setBusy(false);}
    })();
    return()=>{active=false;};
  },[context,storeId,section,page,bearer]);
  const selected=sections.find(s=>s.key===section);
  return <main className="min-h-[100dvh] bg-slate-950 p-4 text-slate-100 sm:p-6">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">CentralHub · Staff Workspace</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Welcome, {context?.full_name||session.user.email}</h1>
          <p className="mt-1 text-sm text-slate-300">Your permitted stores and sections only · {context?.role||'Staff'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={()=>void fetchContext()} disabled={busy}>Refresh access</button>
          <button className={button} onClick={()=>void signOut()}>Sign out</button>
        </div>
      </header>
      {error&&<div role="alert" className="rounded-xl border border-rose-600 bg-rose-950/40 p-4 text-rose-200">{error}</div>}
      {context&&<div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,280px)_1fr]">
          <label className="text-sm font-semibold text-white">Assigned store
            <select value={storeId} onChange={e=>{setStoreId(e.target.value);setPage(1);}}
              className="mt-2 block w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-white">
              {context.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <nav aria-label="Assigned work sections" className="flex flex-wrap items-end gap-2">
            {granted.map(s=><button key={s.key}
              className={section===s.key?'rounded-lg bg-cyan-400 px-3 py-2.5 text-sm font-bold text-slate-950':button}
              onClick={()=>{setSection(s.key);setPage(1);}}>{s.label}</button>)}
          </nav>
        </div>
        {granted.length===0?<p className="rounded-xl border border-amber-700 p-4 text-amber-200">No verified work sections are assigned to this account. Ask your Super Admin to review your permissions.</p>:
          <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 p-4">
              <div><h2 className="text-lg font-bold text-white">{selected?.label}</h2>
                <p className="text-xs text-slate-300">Read-only records · Store-scoped access · {total} results</p></div>
              <span className="rounded-md border border-cyan-800 px-2 py-1 text-xs text-cyan-300">Verified feature access</span>
            </div>
            <div className="w-full overflow-x-auto">
              {busy?<p className="p-6 text-slate-300">Loading assigned records…</p>:rows.length===0?
                <p className="p-6 text-slate-300">No records in this section for the selected store.</p>:
                <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
                  <thead className="bg-slate-800 text-slate-100"><tr>
                    {selected?.columns.map(column=><th className="px-3 py-3 font-bold" key={column}>{column.replace(/_/g,' ')}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row,index)=><tr key={String(row.id||index)} className="align-top">
                      {selected?.columns.map(column=><td key={column} className="max-w-xs break-words px-3 py-3 text-slate-200">{displayCell(row[column])}</td>)}
                    </tr>)}
                  </tbody>
                </table>}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-700 p-3">
              <button className={button} disabled={busy||page<=1} onClick={()=>setPage(n=>n-1)}>Previous</button>
              <span className="text-sm text-slate-300">Page {page}</span>
              <button className={button} disabled={busy||page*50>=total} onClick={()=>setPage(n=>n+1)}>Next</button>
            </div>
          </section>}
        <p className="text-xs text-slate-400">Further actions such as refunds, order approval and financial changes require their own separately verified permissions. These cannot be performed through the read-only workspace.</p>
      </div>}
    </div>
  </main>;
}

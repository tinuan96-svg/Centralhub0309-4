'use client';

import {useCallback,useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import StaffPickingPanel from '@/components/StaffPickingPanel';

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
  {key:'fulfilment',permission:'fulfilment.view',label:'Picking & packing queue',columns:['order_number','order_status','warehouse_status','created_at']},
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
  const [reloadCounter,setReloadCounter]=useState(0);
  const [updatingTicket,setUpdatingTicket]=useState('');
  const [claimingOrder,setClaimingOrder]=useState('');
  const [activePickingOrder,setActivePickingOrder]=useState('');
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
  },[context,storeId,section,page,bearer,reloadCounter]);
  const changeSupportStatus=async(ticketId:string,expected:string,next:string)=>{
    if(!context?.permissions.includes('support.edit')||section!=='customer_care'||!storeId||updatingTicket)return;
    setUpdatingTicket(ticketId);setError('');
    try{
      const response=await fetch('/api/staff/support/status',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},
        body:JSON.stringify({ticket_id:ticketId,store_id:storeId,
          expected_status:expected,next_status:next})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not update ticket status');
      setRows([]);setReloadCounter(n=>n+1);
    }catch(err){
      setRows([]);setError(err instanceof Error?err.message:'Ticket update failed');
      setReloadCounter(n=>n+1);
    }finally{setUpdatingTicket('');}
  };
  const claimPicking=async(orderId:string)=>{
    if(!context?.permissions.includes('fulfilment.pick')||section!=='fulfilment'||!storeId||claimingOrder)return;
    setClaimingOrder(orderId);setError('');
    try{
      const response=await fetch('/api/staff/fulfilment/claim',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},
        body:JSON.stringify({order_id:orderId,store_id:storeId})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Unable to claim this order');
      setRows([]);
      setActivePickingOrder(orderId);
      setReloadCounter(n=>n+1);
    }catch(error){
      setRows([]);
      setError(error instanceof Error?error.message:'Picking claim failed');
      setReloadCounter(n=>n+1);
    }finally{setClaimingOrder('');}
  };
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
        {activePickingOrder&&section==='fulfilment'&&context.permissions.includes('fulfilment.pick')&&
          <StaffPickingPanel key={activePickingOrder} orderId={activePickingOrder} storeId={storeId}
            token={bearer} onClose={()=>{setActivePickingOrder('');setReloadCounter(n=>n+1);}}
            onFinished={()=>{setActivePickingOrder('');setReloadCounter(n=>n+1);}}/>}
        {granted.length===0?<p className="rounded-xl border border-amber-700 p-4 text-amber-200">No verified work sections are assigned to this account. Ask your Super Admin to review your permissions.</p>:
          <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 p-4">
              <div><h2 className="text-lg font-bold text-white">{selected?.label}</h2>
                <p className="text-xs text-slate-300">Store-scoped records · {total} results{section==='customer_care'&&context.permissions.includes('support.edit')?' · Ticket status updates enabled':' · Read-only view'}</p></div>
              <span className="rounded-md border border-cyan-800 px-2 py-1 text-xs text-cyan-300">Verified feature access</span>
            </div>
            <div className="w-full overflow-x-auto">
              {busy?<p className="p-6 text-slate-300">Loading assigned records…</p>:rows.length===0?
                <p className="p-6 text-slate-300">No records in this section for the selected store.</p>:
                <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
                  <thead className="bg-slate-800 text-slate-100"><tr>
                    {selected?.columns.map(column=><th className="px-3 py-3 font-bold" key={column}>{column.replace(/_/g,' ')}</th>)}
                    {((section==='customer_care'&&context.permissions.includes('support.edit'))||
                      (section==='fulfilment'&&context.permissions.includes('fulfilment.pick')))&&
                      <th className="px-3 py-3 font-bold">Action</th>}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row,index)=><tr key={String(row.id||index)} className="align-top">
                      {selected?.columns.map(column=><td key={column} className="max-w-xs break-words px-3 py-3 text-slate-200">{displayCell(row[column])}</td>)}
                      {section==='fulfilment'&&context.permissions.includes('fulfilment.pick')&&<td className="px-3 py-3">
                        {typeof row.id==='string'&&row.payment_status==='paid'&&
                          (row.order_status==='paid'||row.order_status==='confirmed')&&
                          row.warehouse_status==='pending'&&!row.locked_by&&
                          <button className={button} disabled={busy||Boolean(claimingOrder)}
                            onClick={()=>void claimPicking(String(row.id))}>
                            {claimingOrder===row.id?'Claiming…':'Claim for picking'}
                          </button>}
                        {typeof row.id==='string'&&row.warehouse_status==='picking'&&
                         row.locked_by===session.user.id&&
                         <button className={button} disabled={busy||Boolean(claimingOrder)}
                           onClick={()=>setActivePickingOrder(String(row.id))}>Continue picking</button>}
                      </td>}
                      {section==='customer_care'&&context.permissions.includes('support.edit')&&<td className="px-3 py-3">
                        {typeof row.id==='string'&&typeof row.status==='string'&&(
                          row.status==='open'||row.status==='in_progress'||row.status==='resolved'||row.status==='closed'
                        )&&<button className={button} disabled={busy||Boolean(updatingTicket)}
                          onClick={()=>void changeSupportStatus(String(row.id),String(row.status),
                            row.status==='open'?'in_progress':row.status==='in_progress'?'resolved':
                            row.status==='resolved'?'closed':'open')}>
                          {updatingTicket===row.id?'Saving…':row.status==='open'?'Start work':
                            row.status==='in_progress'?'Resolve':row.status==='resolved'?'Close':'Reopen'}
                        </button>}
                      </td>}
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
        <p className="text-xs text-slate-400">Customer Care ticket updates and owner-only barcode picking are available only when explicitly assigned. Stock, refunds, packing approval, shipping and financial operations require separate audited workflows.</p>
      </div>}
    </div>
  </main>;
}

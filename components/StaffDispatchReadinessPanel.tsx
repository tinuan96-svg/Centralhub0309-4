'use client';
import {useCallback,useEffect,useState} from 'react';
type Readiness={
 order_id:string;order_number:string;ready_for_handover:boolean;
 issues:string[];dispatch_action_available:boolean;
 shipment:{id:string;carrier:string;status:string;tracking_number:string|null;label_printed:boolean|null}|null;
};
const button='rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';
export default function StaffDispatchReadinessPanel({orderId,storeId,token,onClose,onSaved}:{
 orderId:string;storeId:string;token:string;onClose:()=>void;onSaved?:()=>void;
}){
 const [data,setData]=useState<Readiness|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [confirmed,setConfirmed]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [complete,setComplete]=useState(false);
 const check=useCallback(async()=>{
  setData(null);setConfirmed(false);setError('');setLoading(true);
  try{
   const search=new URLSearchParams({order_id:orderId,store_id:storeId});
   const response=await fetch(`/api/staff/fulfilment/dispatch-readiness?${search}`,{
    headers:{Authorization:`Bearer ${token}`},cache:'no-store'
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Cannot check shipment evidence');
   setData(result as Readiness);
  }catch(err){setError(err instanceof Error?err.message:'Shipment readiness is unavailable');}
  finally{setLoading(false);}
 },[orderId,storeId,token]);
 useEffect(()=>{void check();},[check]);
 const confirmHandover=async()=>{
  if(!confirmed||!data?.dispatch_action_available||!data.shipment||submitting||complete)return;
  setSubmitting(true);setError('');
  try{
   const response=await fetch('/api/staff/shipping/handover',{
    method:'POST',cache:'no-store',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({order_id:orderId,store_id:storeId,shipment_id:data.shipment.id,
      physical_handover_confirmed:true})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Could not confirm physical handover');
   setComplete(true);setConfirmed(false);setData(null);onSaved?.();
  }catch(err){
   setError(err instanceof Error?err.message:'Handover was not recorded');
   setConfirmed(false);setData(null);
  }finally{setSubmitting(false);}
 };
 return <section className="space-y-3 rounded-2xl border border-cyan-800 bg-slate-900 p-4 text-slate-100 sm:p-6">
  <div className="flex flex-wrap items-start justify-between gap-3"><div>
   <h2 className="text-lg font-bold text-white">Courier handover</h2>
   <p className="mt-1 text-sm text-slate-300">An existing booked shipment only. Does not create a new label.</p>
  </div><button className={button} onClick={onClose}>Close</button></div>
  {loading&&<p role="status">Rechecking current order and shipment…</p>}
  {error&&<p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-rose-200">{error}</p>}
  {complete&&<p role="status" className="rounded-lg border border-emerald-600 p-3 text-emerald-200">Physical courier handover was recorded. Order and shipment status changed once.</p>}
  {data&&<>
   <p className="font-semibold text-white">Order {data.order_number}</p>
   <p className={data.ready_for_handover?'text-emerald-300':'text-amber-200'}>
    {data.ready_for_handover?'Booked shipment evidence is ready for handover.':'Courier handover requires review.'}</p>
   {!!data.issues.length&&<ul className="list-disc space-y-1 pl-5 text-sm text-amber-100">
    {data.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
   {data.shipment&&<div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
    <p>Carrier: {data.shipment.carrier}</p><p>Status: {data.shipment.status}</p>
    <p className="break-all">Tracking: {data.shipment.tracking_number||'Not recorded'}</p>
    <p>Shipping label printed: {data.shipment.label_printed===true?'Yes':'Not confirmed'}</p>
   </div>}
   {data.dispatch_action_available&&data.shipment&&<>
    <label className="flex items-start gap-3 rounded-xl border border-amber-800 p-3 text-sm text-white">
     <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}
      className="mt-1 h-4 w-4" disabled={submitting}/>
     I personally confirm that this labelled parcel has physically been handed to the courier. This action advances the order to shipped and may trigger existing customer notifications and store synchronization.
    </label>
    <button className="rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-40"
     disabled={!confirmed||submitting||loading} onClick={()=>void confirmHandover()}>
     {submitting?'Recording handover…':'Confirm physical courier handover'}
    </button>
   </>}
  </>}
  {!complete&&<button className={button} disabled={loading||submitting} onClick={()=>void check()}>Refresh evidence</button>}
 </section>;
}

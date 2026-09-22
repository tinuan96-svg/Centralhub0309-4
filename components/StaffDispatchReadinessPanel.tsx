'use client';
import {useCallback,useEffect,useState} from 'react';
type Readiness={
  order_id:string;order_number:string;ready_for_handover:boolean;
  issues:string[];dispatch_action_available:false;
  shipment:{id:string;carrier:string;status:string;tracking_number:string|null;label_printed:boolean|null}|null;
};
const button='rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';
/** Read-only evidence. No handover/dispatch mutation is offered here. */
export default function StaffDispatchReadinessPanel({orderId,storeId,token,onClose}:{
  orderId:string;storeId:string;token:string;onClose:()=>void;
}){
  const [data,setData]=useState<Readiness|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const check=useCallback(async()=>{
    setData(null);setError('');setLoading(true);
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
  return <section className="space-y-3 rounded-2xl border border-cyan-800 bg-slate-900 p-4 text-slate-100 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-white">Courier handover readiness</h2>
        <p className="mt-1 text-sm text-slate-300">Read-only verification; it does not book or dispatch a parcel.</p>
      </div><button className={button} onClick={onClose}>Close</button>
    </div>
    {loading&&<p role="status">Checking current paid order, packing and shipment records…</p>}
    {error&&<p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-rose-200">{error}</p>}
    {data&&<>
      <p className="font-semibold text-white">Order {data.order_number}</p>
      <p className={data.ready_for_handover?'text-emerald-300':'text-amber-200'}>
        {data.ready_for_handover?'Recorded evidence is ready for courier handover.':'Courier handover has blockers requiring review.'}
      </p>
      {!!data.issues.length&&<ul className="list-disc space-y-1 pl-5 text-sm text-amber-100">
        {data.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
      {data.shipment&&<div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
        <p>Carrier: {data.shipment.carrier}</p><p>Shipment status: {data.shipment.status}</p>
        <p className="break-all">Tracking: {data.shipment.tracking_number||'Not recorded'}</p>
        <p>Shipping label printed: {data.shipment.label_printed===true?'Yes':'Not confirmed'}</p>
      </div>}
      <p className="text-xs text-slate-300">Physical handover, tracking updates and external store synchronization require a separately verified workflow. Readiness does not record dispatch.</p>
    </>}
    <button className={button} disabled={loading} onClick={()=>void check()}>Refresh evidence</button>
  </section>;
}

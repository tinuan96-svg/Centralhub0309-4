'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';

type PickLine={id:string;product_name:string;sku:string|null;quantity:number;picked_quantity:number|null;skip_reason:string|null};
type PickingOrder={id:string;warehouse_status:string;picking_started_at:string|null};
type PickingData={order:PickingOrder;items:PickLine[]};
const button='rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40';

export default function StaffPickingPanel({orderId,storeId,token,onClose,onFinished}:{
 orderId:string;storeId:string;token:string;onClose:()=>void;onFinished:()=>void;
}){
 const [data,setData]=useState<PickingData|null>(null);
 const [itemId,setItemId]=useState('');
 const [barcode,setBarcode]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
   const qs=new URLSearchParams({order_id:orderId,store_id:storeId});
   const res=await fetch(`/api/staff/fulfilment/scan?${qs}`,{
     headers:{Authorization:`Bearer ${token}`},cache:'no-store'
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error||'Could not load picking details');
   setData(body as PickingData);
   const available=(body.items as PickLine[]).find(line=>
      (line.picked_quantity||0)<line.quantity&&!line.skip_reason);
   setItemId(prev=>(body.items as PickLine[]).some(line=>
     line.id===prev&&(line.picked_quantity||0)<line.quantity&&!line.skip_reason)
      ?prev:(available?.id||''));
 },[token,orderId,storeId]);
 useEffect(()=>{
   let active=true;
   void load().catch(err=>{if(active)setError(err instanceof Error?err.message:'Unable to load order');});
   return()=>{active=false;};
 },[load]);
 const scan=async(event:FormEvent<HTMLFormElement>)=>{
   event.preventDefault();
   if(busy||!itemId||barcode.trim().length<3)return;
   setBusy(true);setError('');setNotice('');
   try{
     const response=await fetch('/api/staff/fulfilment/scan',{
       method:'POST',cache:'no-store',
       headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
       body:JSON.stringify({order_id:orderId,store_id:storeId,
         order_item_id:itemId,barcode:barcode.trim()})
     });
     const result=await response.json();
     if(!response.ok)throw new Error(result.error||'The barcode could not be verified');
     setBarcode('');setNotice('One unit verified and saved.');
     await load();
   }catch(err){setError(err instanceof Error?err.message:'Scan failed');}
   finally{setBusy(false);}
 };
 const complete=async()=>{
   if(busy||!data)return;
   setBusy(true);setError('');setNotice('');
   try{
     const start=data.order.picking_started_at?new Date(data.order.picking_started_at).getTime():Date.now();
     const duration=Math.max(0,Math.min(43200,Math.floor((Date.now()-start)/1000)));
     const response=await fetch('/api/staff/fulfilment/complete',{
       method:'POST',cache:'no-store',
       headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
       body:JSON.stringify({order_id:orderId,store_id:storeId,duration_seconds:duration})
     });
     const result=await response.json();
     if(!response.ok)throw new Error(result.error||'Cannot finish picking yet');
     setNotice('Picking completed. The order is ready for packing verification.');
     onFinished();
   }catch(err){setError(err instanceof Error?err.message:'Completion failed');}
   finally{setBusy(false);}
 };
 const finished=(data?.items.length||0)>0 && !!data?.items.every(line=>
   line.quantity>0&&((line.picked_quantity||0)===line.quantity||!!line.skip_reason));
 return <section className="rounded-2xl border border-cyan-800 bg-slate-900 p-4 text-slate-100 sm:p-6">
   <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
     <div><h2 className="text-lg font-bold text-white">Your active picking session</h2>
       <p className="mt-1 text-xs text-slate-300">Scan the exact SKU or GTIN printed on each product. Each scan records one unit.</p>
     </div>
     <button className={button} disabled={busy} onClick={onClose}>Close</button>
   </div>
   {error&&<p role="alert" className="mb-3 rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
   {notice&&<p role="status" className="mb-3 rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}
   {!data?<p className="text-sm text-slate-300">Loading your assigned picking lines…</p>:<>
     <div className="space-y-2">{data.items.map(line=>
       <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
         <div className="min-w-0"><p className="text-sm font-semibold text-white">{line.product_name}</p>
           <p className="text-xs text-slate-300">SKU: {line.sku||'Not provided'} · {line.picked_quantity||0}/{line.quantity} units picked</p>
           {line.skip_reason&&<p className="text-xs text-amber-300">Skipped: {line.skip_reason}</p>}
         </div>
         <button className={button} disabled={busy||!!line.skip_reason||(line.picked_quantity||0)>=line.quantity}
           onClick={()=>setItemId(line.id)} aria-pressed={itemId===line.id}>
           {itemId===line.id?'Selected':'Select'}
         </button>
       </div>)}</div>
     <form onSubmit={scan} className="mt-4 space-y-3">
       <label className="block text-sm font-semibold text-slate-200">Scanned product barcode or SKU
         <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white"
           value={barcode} onChange={event=>setBarcode(event.target.value)}
           autoComplete="off" autoCapitalize="off" placeholder="Scan or enter the code" maxLength={64}/>
       </label>
       <button className={button} disabled={busy||!itemId||barcode.trim().length<3} type="submit">
         {busy?'Saving…':'Verify and pick one unit'}
       </button>
     </form>
     <div className="mt-5 border-t border-slate-700 pt-4">
       <p className="mb-3 text-xs text-slate-300">Every line must be picked or explicitly reviewed as skipped before completion. Unmapped or mismatched legacy orders need manager review.</p>
       <button className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40"
         disabled={busy||!finished} onClick={()=>void complete()}>
         {busy?'Saving…':'Complete picking'}
       </button>
     </div>
   </>}
 </section>;
}

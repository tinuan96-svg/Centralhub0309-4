'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
type Line={id:string;product_name:string;sku:string|null;quantity:number;picked_quantity:number|null;verified_quantity:number|null;skip_reason:string|null};
type PackData={order:{id:string;order_number:string};items:Line[]};
const button='rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40';
export default function StaffPackingPanel({orderId,storeId,token,onClose,onFinished}:{
  orderId:string;storeId:string;token:string;onClose:()=>void;onFinished:()=>void;
}){
  const [data,setData]=useState<PackData|null>(null);
  const [selected,setSelected]=useState('');
  const [barcode,setBarcode]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    const search=new URLSearchParams({order_id:orderId,store_id:storeId});
    const response=await fetch(`/api/staff/fulfilment/verify?${search}`,{
      headers:{Authorization:`Bearer ${token}`},cache:'no-store'
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Unable to load packing order');
    const loaded=result as PackData;
    setData(loaded);
    setSelected(previous=>loaded.items.some(item=>item.id===previous&&
      (item.verified_quantity||0)<item.quantity)?previous:
      loaded.items.find(item=>(item.verified_quantity||0)<item.quantity)?.id||'');
  },[orderId,storeId,token]);
  useEffect(()=>{let mounted=true;void load().catch(err=>{
    if(mounted)setError(err instanceof Error?err.message:'Unable to load packing details');
  });return()=>{mounted=false};},[load]);
  const scan=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(busy||!selected||barcode.trim().length<3)return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/staff/fulfilment/verify',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({order_id:orderId,store_id:storeId,
          order_item_id:selected,barcode:barcode.trim()})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Barcode verification failed');
      setBarcode('');setNotice('One item barcode verified and saved.');
      await load();
    }catch(err){setError(err instanceof Error?err.message:'Verification failed');}
    finally{setBusy(false);}
  };
  const complete=async()=>{
    if(busy||!data)return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/staff/fulfilment/pack',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({order_id:orderId,store_id:storeId})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Cannot complete packing');
      onFinished();
    }catch(err){setError(err instanceof Error?err.message:'Packing not completed');}
    finally{setBusy(false);}
  };
  const finished=!!data?.items.length&&data.items.every(line=>
    line.quantity>0&&(line.picked_quantity||0)===line.quantity&&
    !line.skip_reason&&(line.verified_quantity||0)===line.quantity);
  return <section className="space-y-4 rounded-2xl border border-cyan-800 bg-slate-900 p-4 text-slate-100 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-white">Barcode packing verification</h2>
        <p className="mt-1 text-xs text-slate-300">Verify every picked unit by scanning its own SKU or GTIN.</p></div>
      <button className={button} disabled={busy} onClick={onClose}>Close</button>
    </div>
    {error&&<p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}
    {!data?<p className="text-slate-300">Loading assigned order…</p>:<>
      <div className="space-y-2">{data.items.map(line=><div key={line.id}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3">
        <div><p className="font-semibold text-white">{line.product_name}</p>
          <p className="text-xs text-slate-300">SKU: {line.sku||'Not provided'} · Verified {line.verified_quantity||0}/{line.quantity}</p>
        </div>
        <button className={button} disabled={busy||(line.verified_quantity||0)>=line.quantity}
          aria-pressed={selected===line.id} onClick={()=>setSelected(line.id)}>
          {selected===line.id?'Selected':'Select'}
        </button>
      </div>)}</div>
      <form onSubmit={scan} className="space-y-3">
        <label className="block text-sm font-semibold text-white">Product barcode / SKU
          <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white"
            autoComplete="off" value={barcode} maxLength={64}
            placeholder="Scan product barcode" onChange={event=>setBarcode(event.target.value)}/>
        </label>
        <button className={button} type="submit" disabled={busy||!selected||barcode.trim().length<3}>
          {busy?'Verifying…':'Verify one unit'}
        </button>
      </form>
      <div className="border-t border-slate-700 pt-4">
        <p className="mb-3 text-xs text-slate-300">Packing cannot complete until all required units are barcode-verified. Skipped or unmapped order lines need manager review.</p>
        <button className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40"
          disabled={busy||!finished} onClick={()=>void complete()}>
          {busy?'Saving…':'Complete verified packing'}
        </button>
      </div>
    </>}
  </section>;
}

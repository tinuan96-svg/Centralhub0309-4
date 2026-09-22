'use client';
import {useState} from 'react';
export default function StaffExactReconciliationPanel({transactionId,storeId,token,onClose,onSaved}:{
 transactionId:string;storeId:string;token:string;onClose:()=>void;onSaved:()=>void;
}){
 const [orderNumber,setOrderNumber]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const submit=async()=>{
  if(!confirmed||saving||orderNumber.trim().length<3)return;
  setSaving(true);setError('');
  try{
   const response=await fetch('/api/staff/accounting/reconcile-exact',{
    method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({bank_transaction_id:transactionId,store_id:storeId,
      order_number:orderNumber.trim(),confirm_exact_single_order_match:true})
   });
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Reconciliation was not completed');
   onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Reconciliation was not saved');
   setConfirmed(false);
  }finally{setSaving(false);}
 };
 return <section className="space-y-3 rounded-2xl border border-cyan-700 bg-slate-900 p-4 text-white">
  <h2 className="text-lg font-bold">Exact one-order bank reconciliation</h2>
  <p className="text-sm text-slate-300">Only one positive bank credit whose reference and exact amount match a paid order in this store can be reconciled. Pooled gateway payouts, supplier payments, refunds and ambiguous matches require manager review.</p>
  <label className="block text-sm">Paid order number
   <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white"
    maxLength={80} value={orderNumber} onChange={e=>{setOrderNumber(e.target.value);setConfirmed(false);}}
    placeholder="Enter the paid order number"/>
  </label>
  <label className="flex items-start gap-3 rounded-xl border border-amber-700 p-3 text-sm">
   <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={saving}/>
   I verified that this bank credit belongs to exactly one paid order, in the selected store, with the same amount and reference. The database will reject a mismatch.
  </label>
  {error&&<p role="alert" className="rounded-xl border border-rose-600 p-3 text-rose-200">{error}</p>}
  <div className="flex flex-wrap gap-2">
   <button className="rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-40"
    disabled={!confirmed||orderNumber.trim().length<3||saving}
    onClick={()=>void submit()}>{saving?'Checking…':'Confirm exact reconciliation'}</button>
   <button className="rounded-xl border border-slate-500 px-4 py-3 text-white" disabled={saving} onClick={onClose}>Cancel</button>
  </div>
 </section>;
}

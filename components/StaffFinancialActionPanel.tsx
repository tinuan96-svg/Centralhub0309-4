'use client';
import {useState} from 'react';
const CATEGORIES=['revenue','cogs','variable_cost','operating_expense','finance_cost',
 'tax','asset','liability','equity','transfer','other'];
const control='w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white';
export default function StaffFinancialActionPanel({kind,recordId,storeId,token,onClose,onSaved}:{
 kind:'billing'|'finance';recordId:string;storeId:string;token:string;onClose:()=>void;onSaved:()=>void;
}){
 const [decision,setDecision]=useState<'reviewed'|'needs_correction'>('reviewed');
 const [note,setNote]=useState('');
 const [category,setCategory]=useState('operating_expense');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const submit=async()=>{
  if(saving)return;
  setSaving(true);setError('');
  try{
   const billing=kind==='billing';
   const response=await fetch(billing?'/api/staff/billing/review':'/api/staff/accounting/classify',{
    method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify(billing?
      {document_id:recordId,store_id:storeId,decision,note}:
      {bank_transaction_id:recordId,store_id:storeId,accounting_category:category})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Could not save your review');
   onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Review was not saved');}
  finally{setSaving(false);}
 };
 return <section className="space-y-4 rounded-2xl border border-cyan-700 bg-slate-900 p-4 text-slate-100">
  <div className="flex items-center justify-between gap-3">
   <div><h2 className="font-bold text-white">{kind==='billing'?'Review billing document':'Classify bank transaction'}</h2>
    <p className="text-xs text-slate-300">{kind==='billing'?
     'Review only. No invoice will be issued, posted, paid or emailed.':
     'Only the accounting category changes. The bank balance, amount, reconciliation and payout remain untouched.'}</p>
   </div>
   <button className={control} style={{width:'auto'}} disabled={saving} onClick={onClose}>Close</button>
  </div>
  {kind==='billing'?<>
   <label className="block text-sm font-semibold">Review decision
    <select className={control} value={decision} onChange={e=>setDecision(e.target.value as 'reviewed'|'needs_correction')}>
     <option value="reviewed">Checked — send for administrator approval</option>
     <option value="needs_correction">Needs correction</option>
    </select>
   </label>
   <label className="block text-sm font-semibold">Review note
    <textarea rows={3} maxLength={1000} className={control} value={note}
     onChange={e=>setNote(e.target.value)} placeholder="Document or amount details requiring correction"/>
   </label>
  </>:<label className="block text-sm font-semibold">Accounting category
   <select className={control} value={category} onChange={e=>setCategory(e.target.value)}>
    {CATEGORIES.map(x=><option value={x} key={x}>{x.replaceAll('_',' ')}</option>)}
   </select>
  </label>}
  {error&&<p role="alert" className="rounded-lg border border-rose-600 p-3 text-rose-200">{error}</p>}
  <button className="rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-40"
    disabled={saving||(kind==='billing'&&decision==='needs_correction'&&note.trim().length<5)}
    onClick={()=>void submit()}>{saving?'Saving…':'Save audited review'}</button>
 </section>;
}

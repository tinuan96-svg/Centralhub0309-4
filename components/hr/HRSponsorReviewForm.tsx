'use client';import {useState} from 'react';
type Employee={id:string;full_name:string;employee_number:string};
export default function HRSponsorReviewForm({company,token,employees,onSaved}:{company:string;token:string;employees:Employee[];onSaved:()=>Promise<void>}){
 const [employee,setEmployee]=useState(''),[occupation,setOccupation]=useState(''),[title,setTitle]=useState(''),[visaExpiry,setVisaExpiry]=useState(''),[rightToWorkFollowup,setRightToWorkFollowup]=useState(''),[ack,setAck]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();if(!employee||!ack||saving||(!visaExpiry&&!rightToWorkFollowup))return;
 setSaving(true);setError('');setNotice('');
 try{const r=await fetch('/api/hr-payroll/sponsor',{method:'POST',
 headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
 body:JSON.stringify({company,employee,occupation,title,visaExpiry,rightToWorkFollowup,humanReviewAcknowledged:true})});
 const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not save review case.');
 setNotice('Internal sponsor case and review reminders saved; no immigration status was changed or reported to UKVI.');
 setEmployee('');setOccupation('');setTitle('');setVisaExpiry('');setRightToWorkFollowup('');setAck(false);
 await onSaved();
 }catch(err){setError(err instanceof Error?err.message:'Case review unavailable.')}finally{setSaving(false)}}
 return <form onSubmit={e=>void submit(e)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
  <h2 className="text-lg font-bold">Create a sponsorship review case</h2>
  <p className="mt-2 text-xs text-amber-200">Internal record only — not an SMS report or confirmation of visa/right-to-work status. Check source documents and applicable guidance. Enter review dates; do not enter CoS identifiers or upload immigration documents here.</p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-semibold">Employee draft / profile<select required value={employee} onChange={e=>setEmployee(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white">
     <option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employee_number} — {x.full_name}</option>)}</select></label>
    <label className="text-xs font-semibold">Occupation code (optional)<input value={occupation} maxLength={20} onChange={e=>setOccupation(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
    <label className="text-xs font-semibold">Sponsored job title (optional)<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
    <label className="text-xs font-semibold">Visa expiry date (if verified)<input type="date" value={visaExpiry} onChange={e=>setVisaExpiry(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
    <label className="text-xs font-semibold">Right-to-work follow-up (if verified)<input type="date" value={rightToWorkFollowup} onChange={e=>setRightToWorkFollowup(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
  </div>
  <label className="mt-4 flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I am an authorised administrator and understand that this is a pending internal review, not a completed Home Office check or report.</span></label>
  {error&&<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
  <button disabled={!ack||!employee||(!visaExpiry&&!rightToWorkFollowup)||saving} className="mt-4 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{saving?'Saving…':'Save review case'}</button>
 </form>;
}
'use client';
import {useState} from 'react';
type Employee={id:string;employee_number:string;full_name:string;status:string};
const leaveTypes=[['annual','Annual leave'],['sick','Sick leave'],['unpaid','Unpaid leave'],['maternity','Maternity leave'],['paternity','Paternity leave'],['adoption','Adoption leave'],['parental','Parental leave'],['other','Other']] as const;
export default function HRLeaveRequestForm({company,token,employees,onSaved}:{company:string;token:string;employees:Employee[];onSaved:()=>Promise<void>}){
 const [employee,setEmployee]=useState(''),[leaveType,setLeaveType]=useState('annual'),[startsOn,setStartsOn]=useState(''),[endsOn,setEndsOn]=useState(''),
 [confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();if(!employee||!startsOn||!endsOn||!confirmed||saving)return;
 setSaving(true);setError('');setNotice('');
 try{
  const r=await fetch('/api/hr-payroll/leave',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({company,employee,leaveType,startsOn,endsOn,humanReviewed:true})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||'Leave request unavailable.');
  setNotice('Pending leave request saved for authorised review. No entitlement, attendance or payroll figures were changed.');
  setEmployee('');setStartsOn('');setEndsOn('');setConfirmed(false);
  await onSaved();
 }catch(e){setError(e instanceof Error?e.message:'Leave request failed.')}finally{setSaving(false)}
 }
 return (
 <form onSubmit={e=>void submit(e)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
  <h2 className="font-black">Record an internal leave request</h2>
  <p className="mt-2 text-xs text-amber-200">Pending request only. This is not leave approval, holiday entitlement, paid absence, statutory leave determination or a payroll deduction. Requests involving draft employees remain provisional.</p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">
   <label className="text-xs font-semibold">Employee<select required value={employee} onChange={e=>setEmployee(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employee_number} — {x.full_name} ({x.status})</option>)}</select></label>
   <label className="text-xs font-semibold">Type<select value={leaveType} onChange={e=>setLeaveType(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white">{leaveTypes.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
   <label className="text-xs font-semibold">From<input required type="date" value={startsOn} onChange={e=>setStartsOn(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
   <label className="text-xs font-semibold">Through<input required type="date" value={endsOn} onChange={e=>setEndsOn(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
  </div>
  <label className="mt-4 flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I have reviewed the request and understand it will remain pending until the applicable leave entitlement and approval process is verified.</span></label>
  {error&&<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
  {notice&&<p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
  <button disabled={!employee||!startsOn||!endsOn||!confirmed||saving} className="mt-4 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{saving?'Saving…':'Save pending leave request'}</button>
 </form>);
}

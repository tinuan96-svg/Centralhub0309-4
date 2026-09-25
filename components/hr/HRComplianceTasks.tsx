'use client';
import {useCallback,useEffect,useState} from 'react';
type Task={id:string;task_type:string;title:string;due_at:string|null;status:string;guidance_version:string|null;reviewed_at:string|null;review_note:string|null};
export default function HRComplianceTasks({company,token}:{company:string;token:string}){
 const [tasks,setTasks]=useState<Task[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
 const [selected,setSelected]=useState(''),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[working,setWorking]=useState(false);
 const load=useCallback(async()=>{
  if(!company||!token)return;
  setLoading(true);setError('');
  try{
   const r=await fetch('/api/hr-payroll/tasks?company='+encodeURIComponent(company),{cache:'no-store',headers:{Authorization:'Bearer '+token}});
   const json=await r.json();if(!r.ok)throw new Error(json.error||'Cannot load compliance tasks.');
   setTasks(json.tasks||[]);
  }catch(e){setError(e instanceof Error?e.message:'Compliance tasks are unavailable.');setTasks([])}
  finally{setLoading(false)}
 },[company,token]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{setSelected('');setNote('');setConfirmed(false);setNotice('')},[company]);
 async function review(task:Task,action:'complete'|'reopen'){
  if(!confirmed||working||!company||!token)return;
  setWorking(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/hr-payroll/tasks',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({company,task:task.id,action,note:action==='complete'?note:'',humanReviewed:true})});
   const json=await r.json();if(!r.ok)throw new Error(json.error||'Human review was not recorded.');
   setNotice(action==='complete'?'Internal task marked complete after human review. No UKVI/HMRC report was submitted.':'Internal task reopened for human review.');
   setSelected('');setNote('');setConfirmed(false);await load();
  }catch(e){setError(e instanceof Error?e.message:'Review unavailable.')}
  finally{setWorking(false)}
 }
 return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Compliance tasks · manual review</h2><span className="rounded-lg border border-amber-800 px-2 py-1 text-xs text-amber-200">No external submission</span></div>
  <p className="mt-2 text-xs text-slate-400">Only an authorised Super Admin can record an internal review. Check original evidence and current official guidance before completing a task; this does not report anything to the Home Office or HMRC.</p>
  {loading&&<p role="status" className="mt-3 text-sm">Loading tasks…</p>}
  {error&&<p role="alert" className="mt-3 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">{error}</p>}
  {notice&&<p role="status" className="mt-3 rounded-lg border border-emerald-700 p-3 text-sm text-emerald-200">{notice}</p>}
  <div className="mt-4 space-y-3">{tasks.map(t=><article key={t.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
   <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{t.title}</p><p className="mt-1 text-xs text-slate-500">{t.task_type} · Due: {t.due_at?new Date(t.due_at).toLocaleDateString('en-GB'):'Requires manual deadline review'}</p></div>
   <span className={'text-xs '+(t.status==='completed'?'text-emerald-300':'text-amber-200')}>{t.status.replace('_',' ')}</span></div>
   {t.reviewed_at&&<p className="mt-2 text-xs text-slate-500">Last reviewed {new Date(t.reviewed_at).toLocaleString('en-GB')}. {t.review_note||''}</p>}
   {['open','in_review','completed'].includes(t.status)&&<div className="mt-3">
    <button type="button" onClick={()=>{setSelected(selected===t.id?'':t.id);setNote('');setConfirmed(false)}} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold">{selected===t.id?'Cancel review':t.status==='completed'?'Reopen task':'Record human review'}</button>
    {selected===t.id&&<div className="mt-3 space-y-3 rounded-lg border border-slate-700 p-3">
      {t.status!=='completed'&&<label className="block text-xs font-semibold">Review note (20–400 characters; do not paste personal records or documents)<textarea value={note} maxLength={400} onChange={e=>setNote(e.target.value)} rows={3} className="mt-2 block w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-white"/></label>}
      <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I have independently reviewed the underlying task and accept responsibility for this internal status update.</span></label>
      <button type="button" disabled={!confirmed||working||(t.status!=='completed'&&note.trim().length<20)} onClick={()=>void review(t,t.status==='completed'?'reopen':'complete')} className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{working?'Saving…':t.status==='completed'?'Confirm reopen':'Confirm task reviewed'}</button>
    </div>}
   </div>}
  </article>)}{!loading&&!tasks.length&&<p className="text-sm text-slate-400">No compliance tasks for this employer.</p>}</div>
 </section>;
}
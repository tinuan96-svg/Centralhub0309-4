'use client';import {useCallback,useEffect,useState} from 'react';
type Employee={id:string;employee_number:string;full_name:string;status:string};
type Shift={id:string;employee_id:string;starts_at:string;ends_at:string;unpaid_break_minutes:number;status:string};
export default function HRShiftPlanner({company,token,employees}:{company:string;token:string;employees:Employee[]}){
 const [shifts,setShifts]=useState<Shift[]>([]),[employee,setEmployee]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[breaks,setBreaks]=useState('30');
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState('');
 const names=new Map(employees.map(e=>[e.id,e]));
 const load=useCallback(async()=>{if(!company||!token)return;setLoading(true);setError('');
 try{const r=await fetch('/api/hr-payroll/shifts?company='+encodeURIComponent(company),{headers:{Authorization:'Bearer '+token},cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Shifts unavailable.');setShifts(j.shifts||[])}
 catch(e){setError(e instanceof Error?e.message:'Shift data unavailable.');setShifts([])}finally{setLoading(false)}
 },[company,token]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{setEmployee('');setStart('');setEnd('');setConfirmed('');setNotice('')},[company]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!employee||saving||!start||!end)return;
 setSaving(true);setError('');setNotice('');
 try{const r=await fetch('/api/hr-payroll/shifts',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'plan',company,employee,start:new Date(start).toISOString(),end:new Date(end).toISOString(),breakMinutes:Number(breaks)})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Shift plan not saved.');
 setNotice('Shift plan saved. This is not an issued shift and does not generate payable hours.');setStart('');setEnd('');await load();
 }catch(e){setError(e instanceof Error?e.message:'Shift plan failed.')}finally{setSaving(false)}}
 async function publish(s:Shift){if(!confirmed||confirmed!==s.id||saving)return;setSaving(true);setError('');setNotice('');
 try{const r=await fetch('/api/hr-payroll/shifts',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'publish',company,shift:s.id,humanReviewed:true})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Shift not issued.');
 setConfirmed('');setNotice('Shift issued after authorised review. No attendance, payroll, or external action occurred.');await load();
 }catch(e){setError(e instanceof Error?e.message:'Issue failed.')}finally{setSaving(false)}}
 return <section className="space-y-4"><form onSubmit={e=>void submit(e)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
 <h2 className="font-black">Plan a shift</h2><p className="mt-2 text-xs text-amber-200">Plans for draft employees are not issued. Shift times are entered in your device timezone and stored as UTC; verify the worker's location and employment arrangements.</p>
 <div className="mt-3 grid gap-3 sm:grid-cols-2">
 <label className="text-xs font-semibold">Employee<select required value={employee} onChange={e=>setEmployee(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employee_number} — {x.full_name} ({x.status})</option>)}</select></label>
 <label className="text-xs font-semibold">Start<input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
 <label className="text-xs font-semibold">End<input required type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
 <label className="text-xs font-semibold">Unpaid break (minutes)<input required type="number" min="0" max="960" value={breaks} onChange={e=>setBreaks(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white"/></label>
 </div><button disabled={!employee||!start||!end||saving} className="mt-4 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{saving?'Saving…':'Save planned shift'}</button>
 </form>
 <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5"><h2 className="font-black">Employer shift register</h2>
 {error&&<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
 {loading&&<p className="mt-3 text-sm text-slate-400">Loading shifts…</p>}
 <div className="mt-3 space-y-3">{shifts.map(s=><div key={s.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
 <div className="flex flex-wrap justify-between gap-2"><div><strong>{names.get(s.employee_id)?.full_name||'Employee'}</strong><p className="mt-1 text-xs text-slate-400">{new Date(s.starts_at).toLocaleString('en-GB')} – {new Date(s.ends_at).toLocaleString('en-GB')} · {s.unpaid_break_minutes} min unpaid break</p></div><span className={s.status==='scheduled'?'text-emerald-300':'text-amber-200'}>{s.status}</span></div>
 {s.status==='planned'&&names.get(s.employee_id)?.status==='active'&&<div className="mt-3">
  <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed===s.id} onChange={e=>setConfirmed(e.target.checked?s.id:'')}/><span>I have reviewed this active employee's contract, schedule and working-time requirements and authorise issuing this shift.</span></label>
  <button type="button" disabled={confirmed!==s.id||saving} onClick={()=>void publish(s)} className="mt-3 rounded-lg border border-cyan-700 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40">Issue reviewed shift</button></div>}
 </div>)}{!loading&&!shifts.length&&<p className="text-sm text-slate-400">No planned or issued shifts.</p>}</div></section></section>;
}

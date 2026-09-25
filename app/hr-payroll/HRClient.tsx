'use client';
import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useAuth} from '@/components/AuthProvider';
import HRSandboxNICalculator from '@/components/hr/HRSandboxNICalculator';
import HRPreviewPayCalculator from '@/components/hr/HRPreviewPayCalculator';
import HRComplianceTasks from '@/components/hr/HRComplianceTasks';

export const HR_SECTIONS=[
  ['dashboard','Dashboard'],['employees','Employees'],['attendance','Attendance'],
  ['shifts','Shifts'],['leave','Leave Management'],['sponsor-compliance','Sponsor Compliance'],
  ['payroll','Payroll'],['payslips','Payslips'],['pensions','Pensions'],
  ['hmrc-paye','HMRC / PAYE'],['reports','Reports'],['settings','Settings']
] as const;
type Employee={id:string;employee_number:string;full_name:string;job_title:string|null;start_date:string;status:string};
type Attendance={id:string;employee_id:string;clock_in:string;clock_out:string|null;unpaid_break_minutes:number;approval_status:string};
type Leave={id:string;employee_id:string;leave_type:string;starts_on:string;ends_on:string;approval_status:string};
type Sponsor={id:string;employee_id:string;visa_expiry_date:string|null;right_to_work_followup_date:string|null;compliance_status:string};
type Payroll={id:string;period_start:string;period_end:string;tax_year:string;pay_frequency:string;status:string};
type Snapshot={company_id:string;employees:Employee[];attendance:Attendance[];leave:Leave[];sponsorship:Sponsor[];payroll:Payroll[];metrics:Record<string,number>};
type Company={id:string;legal_company_name:string|null;trading_name:string|null};
const metricLabels:[string,string][]=[
  ['total_employees','Employees'],['active_employees','Active employees'],['sponsored_employees','Sponsored employees'],
  ['on_leave','Currently on leave'],['expiring_visas_90_days','Visas expiring (90 days)'],
  ['overdue_followup','Overdue right-to-work follow-ups'],['draft_payroll','Draft payroll runs']
];
const moneyUnavailable='Not calculated — payroll engine awaiting HMRC test validation';
export default function HRClient({section}:{section:string}){
  const {isAdmin,session}=useAuth();
  const [companies,setCompanies]=useState<Company[]>([]);
  const [company,setCompany]=useState('');
  const [data,setData]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [form,setForm]=useState({employee_number:'',full_name:'',start_date:'',job_title:''});
  const [saving,setSaving]=useState(false);
  const active=HR_SECTIONS.find(([key])=>key===section);
  const reload=useCallback(async(id:string,token:string)=>{
    setLoading(true);setError('');
    try{
      const url='/api/hr-payroll'+(id?'?company='+encodeURIComponent(id):'');
      const response=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'HR data unavailable');
      setCompanies(body.companies||[]);
      setData(body.snapshot||null);
    }catch(e){setError(e instanceof Error?e.message:'HR service unavailable');setData(null)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{if(isAdmin&&session?.access_token)void reload(company,session.access_token)},[company,isAdmin,session?.access_token,reload]);
  const names=useMemo(()=>new Map((data?.employees||[]).map(e=>[e.id,e.full_name])),[data]);
  const filtered=(data?.employees||[]).filter(e=>(e.full_name+' '+e.employee_number+' '+(e.job_title||'')).toLowerCase().includes(search.toLowerCase()));
  async function createDraft(e:React.FormEvent){
    e.preventDefault();
    if(!session?.access_token||!isAdmin||!company||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/hr-payroll',{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
        body:JSON.stringify({action:'create_employee_draft',company,...form})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Could not save draft');
      setForm({employee_number:'',full_name:'',start_date:'',job_title:''});
      setNotice('Employee draft saved. Employment activation, payroll and self-service are not enabled.');
      await reload(company,session.access_token);
    }catch(err){setError(err instanceof Error?err.message:'Could not save draft')}
    finally{setSaving(false)}
  }
  if(!active||!isAdmin)return <main className="p-6 text-slate-100"><h1 className="text-xl font-bold">HR access is restricted</h1><p>Only a verified CentralHub Super Admin can access this initial HR workspace.</p></main>;
  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-6 xl:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-400">CentralHub / HR & Payroll</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">{active[1]}</h1>
        <p className="mt-2 text-sm text-slate-400">Private HR workspace · restricted to verified Super Admin · no live filings or salary payments</p></div>
        <span className="rounded-full border border-amber-600/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">Phased rollout · draft records only</span>
      </header>
      <nav aria-label="HR modules" className="flex flex-wrap gap-2">{HR_SECTIONS.map(([key,label])=>
        <Link key={key} href={key==='dashboard'?'/hr-payroll':'/hr-payroll/'+key}
        aria-current={key===section?'page':undefined}
        className={'rounded-xl border px-3 py-2 text-xs font-semibold transition '+(key===section?'border-cyan-400 bg-cyan-500/15 text-cyan-200':'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500')}>{label}</Link>)}</nav>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <label className="block text-sm font-semibold" htmlFor="hr-company">Employer / legal company</label>
        <select id="hr-company" value={company} onChange={e=>setCompany(e.target.value)}
          className="mt-2 w-full max-w-md rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white">
          <option value="">Select a company</option>{companies.map(c=><option key={c.id} value={c.id}>{c.legal_company_name||c.trading_name||'Unlabelled legal identity'}</option>)}
        </select>
        <p className="mt-2 text-xs text-slate-400">Each HR record is scoped to the existing company identity. Store login accounts are not automatically employee profiles.</p>
      </div>
      {loading&&<p role="status" className="text-sm text-slate-300">Loading company HR records…</p>}
      {error&&<p role="alert" className="rounded-xl border border-rose-600/50 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {notice&&<p role="status" className="rounded-xl border border-emerald-600/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</p>}
      {!company?<p className="rounded-2xl border border-slate-800 p-5 text-slate-400">Select a legal company to view HR data.</p>:!data&&!loading?<p className="text-slate-400">No HR data available for the selected company.</p>:data&&<>
        {section==='dashboard'&&<div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{metricLabels.map(([key,label])=>
            <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-cyan-300">{data.metrics[key]??'—'}</p>
            </div>)}</div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-bold">Payroll and attendance validation</h2>
            <p className="mt-2 text-sm text-amber-200">{moneyUnavailable}</p>
            <p className="mt-2 text-sm text-slate-400">Absent-today totals require assigned shifts and approved leave. Missing attendance is not counted as absence. Compliance deadlines require individual case review.</p></div>
        </div>}
        {section==='dashboard'&&session?.access_token&&<HRComplianceTasks company={company} token={session.access_token}/>}
        {section==='employees'&&<div className="space-y-5">
          <form onSubmit={createDraft} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5 space-y-4">
            <div><h2 className="text-lg font-bold">Create an employee draft</h2><p className="text-xs text-slate-400">No NI number, immigration documents, bank details or salary data collected until protected workflows are verified.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([['employee_number','Employee ID'],['full_name','Full name'],['job_title','Job title'],['start_date','Employment start date']] as const).map(([key,label])=>
                <label key={key} className="text-xs font-semibold">{label}<input required={key!=='job_title'} type={key==='start_date'?'date':'text'} maxLength={key==='employee_number'?32:key==='full_name'?200:120}
                  value={form[key]} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}
                  className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"/></label>)}
            </div><button disabled={saving} className="rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-40">{saving?'Saving draft…':'Save employee draft'}</button>
          </form>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5"><label className="text-sm font-semibold">Search employees<input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Name, employee ID or job title" className="mt-2 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"/></label>
            <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="p-2">Employee</th><th className="p-2">ID</th><th className="p-2">Job title</th><th className="p-2">Start</th><th className="p-2">Status</th></tr></thead><tbody>{filtered.map(e=>
              <tr key={e.id} className="border-t border-slate-800"><td className="p-2 font-semibold">{e.full_name}</td><td className="p-2">{e.employee_number}</td><td className="p-2">{e.job_title||'—'}</td><td className="p-2">{e.start_date}</td><td className="p-2">{e.status}</td></tr>)}</tbody></table>
              {!filtered.length&&<p className="p-4 text-sm text-slate-400">No matching employee drafts.</p>}</div>
          </div>
        </div>}
        {section==='attendance'&&<div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-bold">Attendance record review</h2><p className="mt-2 text-sm text-amber-200">Clock-in and correction approvals are disabled until authenticated employee access and working-hours validation are verified.</p>
          <div className="mt-4 space-y-2">{data.attendance.map(a=><div key={a.id} className="rounded-lg border border-slate-700 p-3 text-sm">{names.get(a.employee_id)||'Employee'} · {new Date(a.clock_in).toLocaleString('en-GB')} → {a.clock_out?new Date(a.clock_out).toLocaleString('en-GB'):'Not clocked out'} · {a.approval_status}</div>)}{!data.attendance.length&&<p className="text-sm text-slate-400">No attendance records.</p>}</div></div>}
        {section==='leave'&&<div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-bold">Leave request review</h2><p className="mt-2 text-sm text-amber-200">Request and approval actions will remain disabled until entitlement and payroll synchronization tests pass.</p>
          <div className="mt-4 space-y-2">{data.leave.map(l=><div key={l.id} className="rounded-lg border border-slate-700 p-3 text-sm">{names.get(l.employee_id)||'Employee'} · {l.leave_type} · {l.starts_on} – {l.ends_on} · {l.approval_status}</div>)}{!data.leave.length&&<p className="text-sm text-slate-400">No leave requests.</p>}</div></div>}
        {section==='sponsor-compliance'&&<div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-bold">Internal sponsorship case review</h2><p className="mt-2 text-sm text-amber-200">Not the official Home Office Sponsorship Management System. No UKVI submission is enabled. Deadline changes must be confirmed by an authorised compliance officer.</p>
          <div className="mt-4 space-y-2">{data.sponsorship.map(s=><div key={s.id} className="rounded-lg border border-slate-700 p-3 text-sm">{names.get(s.employee_id)||'Employee'} · Visa expiry: {s.visa_expiry_date||'Needs verification'} · Right-to-work follow-up: {s.right_to_work_followup_date||'Needs verification'} · {s.compliance_status}</div>)}{!data.sponsorship.length&&<p className="text-sm text-slate-400">No sponsorship cases recorded.</p>}</div></div>}
        {section==='sponsor-compliance'&&session?.access_token&&<HRComplianceTasks company={company} token={session.access_token}/>}
        {section==='payroll'&&<div className="space-y-4"><HRPreviewPayCalculator/><HRSandboxNICalculator/><div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-bold">Draft payroll registry</h2><p className="mt-2 text-sm text-amber-200">No final tax, NI, pension, net pay, payslip, payment or HMRC filing until the calculation engine passes official validation.</p>
          <div className="mt-4 space-y-2">{data.payroll.map(p=><div key={p.id} className="rounded-lg border border-slate-700 p-3 text-sm">{p.period_start} – {p.period_end} · {p.pay_frequency} · {p.tax_year} · {p.status}</div>)}{!data.payroll.length&&<p className="text-sm text-slate-400">No payroll runs.</p>}</div></div></div>}
        {!['dashboard','employees','attendance','leave','sponsor-compliance','payroll'].includes(section)&&
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-lg font-bold">{active[1]} — not enabled</h2>
            <p className="mt-3 text-sm text-slate-300">This area is reserved for the verified HR rollout. No incomplete actions or sample calculations are presented as operational records.</p>
            <p className="mt-2 text-sm text-slate-400">External submissions and transfers require separate documented human approval. Existing company, login and business workflows remain unchanged.</p></div>}
      </>}
    </div>
  </main>;
}

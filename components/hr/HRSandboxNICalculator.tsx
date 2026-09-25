'use client';
import {useMemo,useState} from 'react';
import {calculateSandboxNI,sandboxNI2026,type SandboxFrequency} from '@/lib/hr/sandboxNI2026';
const gbp=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
export default function HRSandboxNICalculator(){
 const [gross,setGross]=useState('1000');
 const [period,setPeriod]=useState<SandboxFrequency>('weekly');
 const [niCategory,setNiCategory]=useState('A');
 const result=useMemo(()=>{
  try{
   if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(gross))return {error:'Enter gross pay in pounds and pence, maximum 2 decimal places'} as const;
   return {data:calculateSandboxNI(Math.round(Number(gross)*100),period,niCategory)} as const;
  }catch(e){return {error:e instanceof Error?e.message:'Input is not supported'} as const;}
 },[gross,period,niCategory]);
 return <section className="rounded-2xl border border-amber-600/40 bg-slate-900 p-4 sm:p-5">
   <p className="text-xs font-bold uppercase tracking-widest text-amber-300">2026–27 sandbox calculator · not payroll</p>
   <h2 className="mt-2 text-lg font-black">Illustrative National Insurance (NI)</h2>
   <p className="mt-2 text-sm text-slate-400">For ordinary Category A employees with weekly or monthly pay only. PAYE, pension, statutory payments, employment allowance and special circumstances are excluded. Results cannot produce a payslip or salary payment.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-3">
    <label className="text-xs font-bold">Gross pay (£)<input type="text" inputMode="decimal" value={gross} onChange={e=>setGross(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-white"/></label>
    <label className="text-xs font-bold">Earnings period<select value={period} onChange={e=>setPeriod(e.target.value as SandboxFrequency)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-white"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
    <label className="text-xs font-bold">NI category<select value={niCategory} onChange={e=>setNiCategory(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-white"><option value="A">A — ordinary employee</option><option value="H">H — not supported</option><option value="M">M — not supported</option><option value="C">C — not supported</option></select></label>
   </div>
   {'error'in result?<p role="alert" className="mt-4 text-sm text-amber-200">{result.error}</p>:result.data&&<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
     {([['Gross pay',result.data.grossPence],['Employee NI estimate',result.data.employeeNIPence],
       ['Employer NI estimate',result.data.employerNIPence],['Gross plus employer NI (partial cost)',result.data.grossPlusEmployerNIPence]] as [string,number][]).map(([label,amount])=>
       <div key={label} className="rounded-xl border border-slate-700 bg-slate-950 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-lg font-black">{gbp(amount)}</p></div>)}
   </div>}
   <p className="mt-3 text-sm text-amber-200">PAYE tax: not calculated · Net pay: not calculated · Full employer cost: not calculated · Approval: unavailable</p>
   <p className="mt-2 text-xs text-slate-400">Rates effective {sandboxNI2026.effectiveFrom}–{sandboxNI2026.effectiveTo}. <a href={sandboxNI2026.source} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">Official HMRC rates and thresholds</a>. Illustrative figures require HMRC-approved payroll verification before operational use.</p>
 </section>;
}

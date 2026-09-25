'use client';
import {useMemo,useState} from 'react';
import {previewPay2026,type PreviewInput} from '@/lib/hr/previewPay2026.mjs';
const money=(p:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(p/100);
const item=(title:string,pence:number)=><div key={title} className="rounded-xl border border-slate-700 bg-slate-950 p-3"><p className="text-xs text-slate-400">{title}</p><p className="mt-2 text-lg font-black">{money(pence)}</p></div>;
export default function HRPreviewPayCalculator(){
 const [x,setX]=useState<PreviewInput>({amount:2500,basis:'monthly',period:'monthly',hours:160,overtimeHours:0,
 overtimeHourlyRate:0,bonus:0,taxCode:'1257L',region:'england',niCategory:'A',
 employeePensionPercent:0,employerPensionPercent:0,pensionTaxTreatment:'relief_at_source',studentLoanPlan:'none',postgraduateLoan:false});
 const num=(key:keyof PreviewInput,label:string)=> <label key={key} className="text-xs font-semibold">{label}<input type="number" min="0" step={key==='hours'||key==='overtimeHours'?'0.25':'0.01'} value={Number(x[key]||0)} onChange={e=>setX(v=>({...v,[key]:Number(e.target.value)}))} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-white"/></label>;
 const select=(key:keyof PreviewInput,label:string,choices:readonly [string,string][])=> <label key={key} className="text-xs font-semibold">{label}<select value={String(x[key]??'')} onChange={e=>setX(v=>({...v,[key]:e.target.value}))} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-white">{choices.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>;
 const result=useMemo(()=>{try{return {data:previewPay2026(x)} as const}catch(e){return {error:e instanceof Error?e.message:'Unsupported calculation'} as const}},[x]);
 return <section className="rounded-2xl border border-cyan-700/50 bg-slate-900 p-4 sm:p-5">
 <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">Illustrative UK take-home pay calculator</h2><span className="rounded-full border border-amber-700 px-3 py-1 text-xs font-bold text-amber-200">Estimate only · cannot issue payslips</span></div>
 <p className="mt-2 text-sm text-slate-400">For ordinary NI Category A and tax code 1257L outside Scotland, weekly/monthly payroll only. This is not an HMRC-validated PAYE engine: enter fictional or non-identifying figures for comparison.</p>
 <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
 {num('amount','Base salary / hourly rate (£)')}
 {select('basis','Salary basis',[['annual','Annual'],['monthly','Monthly'],['weekly','Weekly'],['hourly','Hourly']])}
 {select('period','Payroll period',[['monthly','Monthly'],['weekly','Weekly']])}
 {num('hours','Ordinary hours (hourly pay)')}
 {num('overtimeHours','Overtime hours')}{num('overtimeHourlyRate','Overtime rate (£/hour)')}{num('bonus','Bonus (£ per period)')}
 {select('region','Income tax region',[['england','England'],['wales','Wales'],['northern_ireland','Northern Ireland'],['scotland','Scotland (not supported)']])}
 {select('taxCode','Tax code',[['1257L','1257L (limited preview)'],['BR','BR (not supported)'],['S1257L','S1257L (not supported)']])}
 {select('niCategory','NI category',[['A','A (limited preview)'],['H','H (not supported)'],['M','M (not supported)'],['C','C (not supported)']])}
 {num('employeePensionPercent','Employee pension (% of gross)')}{num('employerPensionPercent','Employer pension (% of gross)')}
 {select('pensionTaxTreatment','Pension tax treatment',[['relief_at_source','Relief at source'],['net_pay','Net pay arrangement']])}
 {select('studentLoanPlan','Student loan',[['none','None'],['1','Plan 1'],['2','Plan 2'],['4','Plan 4'],['5','Plan 5']])}
 <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={x.postgraduateLoan||false} onChange={e=>setX(v=>({...v,postgraduateLoan:e.target.checked}))}/> Postgraduate loan</label>
 </div>
 {'error' in result?<p role="alert" className="mt-4 rounded-xl border border-amber-700 p-3 text-sm text-amber-200">{result.error}</p>:result.data&&<>
 <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
 {[
 ['Gross pay',result.data.grossPence],['PAYE estimate',result.data.payePence],
 ['Employee NI estimate',result.data.employeeNIPence],['Employee pension estimate',result.data.employeePensionPence],
 ['Student loan estimate',result.data.studentLoanPence],['Postgraduate loan estimate',result.data.postgraduateLoanPence],
 ['Illustrative take-home',result.data.netPayPence],['Employer NI estimate',result.data.employerNIPence],
 ['Employer pension estimate',result.data.employerPensionPence],['Illustrative employer cost',result.data.totalEmployerCostPence]
 ].map(([title,pence])=>item(title as string,pence as number))}
 </div>
 <details className="mt-4 rounded-xl border border-slate-700 p-3"><summary className="cursor-pointer text-sm font-bold">Calculation assumptions and excluded cases</summary><ul className="mt-3 space-y-2 text-xs text-slate-400">{result.data.assumptions.map(a=><li key={a}>• {a}</li>)}</ul></details>
 </>}
 <p className="mt-4 text-xs text-amber-200">Do not use these figures to pay employees or report to HMRC. No payroll run is created, stored, approved or transmitted by this calculator.</p>
 <p className="mt-2 text-xs text-slate-400">Source: <a className="text-cyan-300 underline" target="_blank" rel="noreferrer" href="https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027">HMRC 2026–27 rates and thresholds</a>. Final calculations must be checked against official HMRC developer test data and real employment details.</p>
 </section>;
}
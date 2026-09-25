import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'HMRC tax integration roadmap | CentralHub', description: 'Current development and testing status for CentralHub VAT, PAYE and Corporation Tax integrations. No live HMRC filing is available.' };
const roadmap = [
  { title: 'Making Tax Digital for VAT', state: 'In development · sandbox application diagnostic', details: 'The protected CentralHub diagnostic can test HMRC sandbox application authentication and the Hello World endpoint when configured. It does not verify taxpayer OAuth, fraud-prevention headers, VAT obligations, VAT return submission or production access.' },
  { title: 'PAYE and payroll RTI', state: 'Planned · separate test integration', details: 'PAYE RTI uses a separate HMRC test and submission workflow. No live RTI payroll filing is provided through this release.' },
  { title: 'Corporation Tax', state: 'Planned · separate test integration', details: 'CT600 and associated filing formats require their own implementation and testing. CentralHub does not currently submit live Corporation Tax returns.' },
  { title: 'Companies House filings', state: 'Read-only sandbox diagnostic planned', details: 'The available diagnostic is limited to a sandbox company lookup when configured. Company filing authorisation and live filing are not tested or available.' },
] as const;
export default function TaxIntegrations() {
 return <main className="min-h-screen bg-[#07111f] px-5 py-10 text-slate-100 sm:py-16">
  <div className="mx-auto max-w-4xl"><Link href="/" className="text-xl font-black text-cyan-300">CentralHub</Link>
   <p className="mt-12 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Tax &amp; compliance roadmap</p>
   <h1 className="mt-3 text-4xl font-black">HMRC integration status</h1>
   <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300">CentralHub's internal VAT-management and finance views are not equivalent to an HMRC-connected, production-approved filing service. The statuses below describe the current software scope, not a certification or endorsement by HMRC or Companies House.</p>
   <div className="mt-9 grid gap-4 sm:grid-cols-2">{roadmap.map(item=><section key={item.title} className="rounded-2xl border border-white/10 bg-[#102338] p-6"><h2 className="text-xl font-bold">{item.title}</h2><p className="mt-3 text-xs font-bold uppercase tracking-wide text-cyan-300">{item.state}</p><p className="mt-3 text-sm leading-7 text-slate-300">{item.details}</p></section>)}</div>
   <div className="mt-8 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-6 text-sm leading-7 text-slate-200"><h2 className="text-lg font-bold text-white">Before live filing becomes available</h2><p className="mt-2">Taxpayer authorisation, relevant API subscriptions, end-to-end sandbox testing, fraud-prevention requirements, data protection, production credentials and the applicable HMRC processes must be completed and independently verified. No real taxpayer submissions are triggered by this page.</p></div>
   <p className="mt-6 text-sm text-slate-400">Operated by INDIVORA LTD · <Link href="/company" className="text-cyan-300 underline">Company information</Link></p>
   <Link href="/" className="mt-8 inline-block font-bold text-cyan-300 underline">Return to homepage</Link>
  </div>
 </main>;
}

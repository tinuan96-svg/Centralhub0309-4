import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Company information | CentralHub', description: 'Business identity and correspondence details for CentralHub, operated by INDIVORA LTD.' };
export default function CompanyPage() {
  return <main className="min-h-screen bg-[#07111f] px-5 py-10 text-slate-100 sm:py-16">
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-xl font-black text-cyan-300">CentralHub</Link>
      <p className="mt-12 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Company information</p>
      <h1 className="mt-3 text-4xl font-black">CentralHub business identity</h1>
      <p className="mt-5 leading-7 text-slate-300">CentralHub is a business-management software platform operated by INDIVORA LTD. The private CentralHub administrative workspace and the separate CentralHub Shop customer showcase have distinct user access and data arrangements.</p>
      <dl className="mt-8 space-y-5 rounded-2xl border border-white/10 bg-[#102338] p-6">
        <div><dt className="text-sm text-slate-400">Registered company name</dt><dd className="mt-1 font-bold">INDIVORA LTD</dd></div>
        <div><dt className="text-sm text-slate-400">Company number</dt><dd className="mt-1">17459277</dd></div>
        <div><dt className="text-sm text-slate-400">Place of registration</dt><dd className="mt-1">England and Wales</dd></div>
        <div><dt className="text-sm text-slate-400">Registered office · correspondence address</dt><dd className="mt-1">Weald Bridge Nursery, Kents Lane, Epping, England, CM16 6AX</dd></div>
      </dl>
      <p className="mt-6 text-sm leading-7 text-slate-300">For formal business and privacy correspondence, write to the registered office. This address is not a customer collection location. The company's public registration details can be checked through <a className="text-cyan-300 underline" href="https://find-and-update.company-information.service.gov.uk/company/17459277" target="_blank" rel="noopener noreferrer">Companies House</a>.</p>
      <p className="mt-4 text-sm leading-7 text-slate-300">For product information, visit <Link href="/tax-integrations" className="text-cyan-300 underline">tax integration status</Link>. CentralHub Shop is a separate <a href="https://centralhubshop.netlify.app/" className="text-cyan-300 underline">fictional software demonstration</a>, not access to the private CentralHub administrative system.</p>
      <Link href="/" className="mt-8 inline-block font-bold text-cyan-300 underline">Return to homepage</Link>
    </div>
  </main>;
}

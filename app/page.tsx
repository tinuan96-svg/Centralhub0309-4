import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BarChart3, Boxes, CheckCircle2, ChevronRight, LayoutDashboard, LockKeyhole, Package, ShieldCheck, ShoppingBag, Sparkles, Truck, Users } from 'lucide-react';
import PublicFeatureShowcase from '@/components/PublicFeatureShowcase';
import PublicMobileNavigation from '@/components/PublicMobileNavigation';
import PublicInteractiveDemo from '@/components/PublicInteractiveDemo';
import PublicAddonCatalog from '@/components/PublicAddonCatalog';
import PublicRealIntegrationsShowcase from '@/components/PublicRealIntegrationsShowcase';
import { getPublicFeatureGallery } from '@/lib/publicFeatureGallery';

export const metadata: Metadata = {
  title: 'CentralHub | Business software & interactive demo',
  description: 'Explore CentralHub business operations, inventory, reporting and interactive demos. HMRC tax filing integrations are in development and are not available for live filing.',
  alternates: { canonical: 'https://centralhub.network/' },
  openGraph: {
    title: 'CentralHub | Business software & interactive demo',
    description: 'Explore the connected business workspace, advanced modules and interactive sample dashboard.',
    url: 'https://centralhub.network/',
    type: 'website',
  },
};

const features = [
  { icon: ShoppingBag, title: 'Online & in-store sales', detail: 'Bring your sales channels and everyday operations into a connected workspace.' },
  { icon: Boxes, title: 'Inventory & purchasing', detail: 'Track stock availability, suppliers and purchase planning across your stores.' },
  { icon: Truck, title: 'Orders & fulfilment', detail: 'Keep orders organised through picking, packing and dispatch.' },
  { icon: Users, title: 'Customers & support', detail: 'Keep customer details and conversations close to your operational workflows.' },
  { icon: BarChart3, title: 'Business insights', detail: 'View operational trends and performance to support better decisions.' },
  { icon: Sparkles, title: 'AI assistance', detail: 'Use intelligent assistance to help surface insights and manage workflows.' },
];

const steps = [
  { index: '01', title: 'Connect your business', detail: 'Bring the stores and workflows you manage into one place.' },
  { index: '02', title: 'Run day-to-day operations', detail: 'Work with orders, stock, products and customers from one workspace.' },
  { index: '03', title: 'See the bigger picture', detail: 'Review connected insights to understand what needs attention.' },
];

export default function Home() {
  return (
    <main className="relative isolate min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-[#07111f] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[850px] bg-[radial-gradient(ellipse_at_75%_28%,rgba(8,145,178,0.2),transparent_46%),radial-gradient(ellipse_at_20%_5%,rgba(59,130,246,0.15),transparent_48%)]" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111f]/90 backdrop-blur-xl">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/" aria-label="CentralHub homepage" className="flex shrink-0 items-center gap-2 text-white sm:gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 shadow-[0_0_25px_rgba(34,211,238,0.12)] sm:h-10 sm:w-10"><LayoutDashboard aria-hidden="true" className="h-5 w-5 text-cyan-300" /></span>
            <span className="text-base font-black tracking-tight sm:text-xl">Central<span className="text-cyan-300">Hub</span></span>
          </Link>
          <div className="hidden items-center gap-5 text-sm font-medium text-slate-300 md:flex xl:gap-7">
            <a href="#platform" className="hover:text-white">Platform</a>
            <a href="#addons" className="hover:text-white">Features</a>
            <a href="#interactive-demo" className="hover:text-white">Quick demo</a>
            <Link href="/demo" className="hover:text-white">Full demo</Link>
            <a href="#real-integrations" className="hover:text-white">Integrations</a>
            <Link href="/tax-integrations" className="hover:text-white">Tax roadmap</Link>
            <Link href="/company" className="hover:text-white">Company</Link>
          </div>
          <PublicMobileNavigation />
          <Link href="/login" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-extrabold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:gap-2 sm:px-4 sm:text-sm">
            <LockKeyhole aria-hidden="true" className="hidden h-4 w-4 sm:block" /> Login <ArrowRight aria-hidden="true" className="hidden h-4 w-4 sm:block" />
          </Link>
        </nav>
      </header>

      <section id="hero" className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 md:pt-24 lg:grid-cols-[1.04fr_0.96fr] lg:gap-12 lg:px-8 lg:pb-28">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.15em] text-cyan-200"><span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.7)]" /> One connected business workspace</p>
          <h1 className="max-w-2xl text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">Your entire business. <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text text-transparent">One powerful hub.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">Bring sales, inventory, orders, customers and business insights together. CentralHub gives you a clearer view of your operations, across your business.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">Login to CentralHub <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <a href="#interactive-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">Try interactive demo <ChevronRight aria-hidden="true" className="h-4 w-4" /></a>
            <Link href="/demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-6 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">Open full dashboard demo <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300">
            {['Online & in-store', 'Multi-store visibility', 'Operational insights'].map((item) => <span key={item} className="inline-flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-cyan-300" />{item}</span>)}
          </div>
        </div>

        <div aria-label="Approved NORA secure-access artwork" className="relative flex min-w-0 flex-col items-center justify-center">
          <div aria-hidden="true" className="pointer-events-none absolute -inset-5 rounded-[2rem] bg-cyan-400/10 blur-3xl" />
          <div className="relative w-full max-w-[440px] overflow-hidden rounded-[1.6rem] border border-cyan-300/20 bg-[#07111f] shadow-[0_25px_100px_rgba(0,0,0,0.45)]">
            <Image
              src="/feature-visuals/nora-secure-original.png"
              alt="Approved NORA CentralHub secure-access design, featuring a glowing blue AI orb and the NORA branding instead of a personal portrait."
              width={1229}
              height={1536}
              sizes="(max-width: 1024px) min(92vw, 440px), 440px"
              className="block h-auto w-full"
              priority
              unoptimized
            />
          </div>
          <p className="relative mt-3 text-center text-xs leading-6 text-slate-400">Approved NORA visual · illustrative preview. Sign in using the real button on this page.</p>
        </div>
      </section>

      <PublicAddonCatalog />
      <PublicFeatureShowcase />
      <PublicInteractiveDemo />
      <PublicRealIntegrationsShowcase items={getPublicFeatureGallery()} />


      <section id="tax-integrations" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-20 sm:px-6 lg:px-8" aria-labelledby="tax-integrations-title">
        <div className="rounded-3xl border border-cyan-300/20 bg-[#0c2134] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Tax &amp; compliance integrations · in development</p>
          <h2 id="tax-integrations-title" className="mt-3 text-2xl font-black text-white sm:text-3xl">HMRC integrations: a transparent roadmap</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">CentralHub includes VAT management views. HMRC Making Tax Digital VAT authorisation, return retrieval and live submission have not been verified as available. An application-only sandbox diagnostic is not HMRC production approval.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><h3 className="font-bold text-white">Making Tax Digital for VAT</h3><p className="mt-2 text-sm leading-6 text-slate-300">In development · sandbox application testing only. Live VAT filing is not available.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><h3 className="font-bold text-white">PAYE &amp; Corporation Tax</h3><p className="mt-2 text-sm leading-6 text-slate-300">Planned integrations · separate HMRC developer testing and authorisation required.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><h3 className="font-bold text-white">Company filings</h3><p className="mt-2 text-sm leading-6 text-slate-300">Read-only Companies House sandbox diagnostics are planned; live filing is not available.</p></div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-300">Business Rates and Customs Duty / Import VAT are also planned as separate, service-specific modules. No council payment, customs declaration or live tax submission is enabled.</p>
          <Link href="/tax-integrations" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-cyan-200 hover:text-white">Read the tax integration status <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">How CentralHub works</p><h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">From scattered tools to one connected view</h2></div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map(step => <div key={step.index} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><span className="text-3xl font-black text-cyan-300/70">{step.index}</span><h3 className="mt-5 text-lg font-extrabold text-white">{step.title}</h3><p className="mt-3 text-sm leading-7 text-slate-300">{step.detail}</p></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-[#12374b] via-[#10273f] to-[#0b1a2c] p-7 sm:p-10 md:flex-row md:items-center">
          <div className="max-w-xl"><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200"><ShieldCheck aria-hidden="true" className="h-4 w-4" /> Private business workspace</p><h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Ready to open your CentralHub?</h2><p className="mt-3 leading-7 text-slate-200">Your operational dashboard and business information stay behind your existing secure sign-in.</p></div>
          <Link href="/login" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">Sign in securely <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#071120]"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><span className="font-bold text-slate-200">Central<span className="text-cyan-300">Hub</span></span><span>Operated by INDIVORA LTD · Company no. 17459277 · Registered in England and Wales</span><Link href="/company" className="inline-flex min-h-10 items-center text-cyan-200 hover:text-white">Company information</Link><Link href="/privacy" className="inline-flex min-h-10 items-center text-cyan-200 hover:text-white">Privacy</Link><Link href="/terms" className="inline-flex min-h-10 items-center text-cyan-200 hover:text-white">Terms</Link><Link href="/security" className="inline-flex min-h-10 items-center text-cyan-200 hover:text-white">Security</Link><Link href="/contact" className="inline-flex min-h-10 items-center text-cyan-200 hover:text-white">Contact</Link><Link href="/tax-integrations" className="inline-flex min-h-10 items-center text-cyan-200 hover:text-white">Tax integration status</Link><Link href="/demo" className="inline-flex min-h-10 items-center gap-2 text-cyan-200 hover:text-white">Full demo <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link><Link href="/login" className="inline-flex min-h-10 items-center gap-2 text-cyan-200 hover:text-white">Application login <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></div></footer>
    </main>
  );
}

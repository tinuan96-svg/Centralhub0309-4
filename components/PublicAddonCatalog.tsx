import { ArrowRight, Barcode, BotMessageSquare, BookOpenCheck, CalendarClock, Calculator, ChartNoAxesCombined, ClipboardList, Landmark, Megaphone, MessageCircle, Mic, Sparkles, Store, Truck, CreditCard, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Feature = { title: string; description: string; icon: LucideIcon; group: string };
const features: Feature[] = [
  { title: "Unlimited shipment booking", description: "Shipment booking at scale; actual booking volume, rates and carrier restrictions depend on your courier contract.", icon: Truck, group: "Shipping" },
  { title: "Inbuilt WhatsApp message system", description: "Manage configured WhatsApp Business conversations from CentralHub's customer-care inbox.", icon: MessageCircle, group: "Customer care" },
  { title: "AI customer messaging system", description: "Assist with customer replies and messaging workflows, with appropriate setup, permissions and human review.", icon: BotMessageSquare, group: "Customer care" },
  { title: "AI voice assistance for order picking", description: "Support warehouse pickers with spoken instructions, voice commands and picking progress.", icon: Mic, group: "Warehouse" },
  { title: "25 marketing platform integrations", description: "A 25-platform integration roadmap; verified live marketing API modules currently centre on Google and Meta.", icon: Megaphone, group: "Marketing" },
  { title: "Multi-store integration", description: "Connect multiple stores while preserving store-level permissions, reporting and operational visibility.", icon: Store, group: "Operations" },
  { title: "NORA — AI assistance for quick analysis", description: "Ask NORA for operational summaries and quick insights when relevant connected data is available.", icon: Sparkles, group: "Intelligence" },
  { title: "Shipment tracking, costs & live customer updates", description: "Monitor tracking and shipping costs, with customer notifications through configured courier and messaging services.", icon: Truck, group: "Shipping" },
  { title: "Banking integration", description: "Import statements or connect supported banking sources to review transactions and reconciliation.", icon: Landmark, group: "Finance" },
  { title: "VAT management", description: "Organise VAT-related transactions, reporting and checks, with final filings subject to accountant review.", icon: Calculator, group: "Finance" },
  { title: "Accounting information, P&L & balance sheet", description: "Review the chart of accounts, ledgers, profit and loss, and balance-sheet-related reporting.", icon: BookOpenCheck, group: "Accounting" },
  { title: "Barcode system", description: "Scan product barcodes to support stock lookup, goods receiving and picking accuracy.", icon: Barcode, group: "Inventory" },
  { title: "Expiry date management", description: "Track expiry dates and batches so stock needing attention is easier to identify.", icon: CalendarClock, group: "Inventory" },
  { title: "Supplier management & purchase orders", description: "Organise suppliers, purchasing plans, purchase orders and goods-received workflows.", icon: ClipboardList, group: "Purchasing" },
  { title: "AI marketing & SEO", description: "Support campaign and product-content creation with AI assistance and human approval.", icon: Search, group: "Growth" },
  { title: "Pricing management", description: "Analyse costs, margins and competitor signals with controlled pricing approvals.", icon: CreditCard, group: "Pricing" },
  { title: "Finance management", description: "Bring expenses, cashflow, invoices, supplier payables and profitability into one workspace.", icon: ChartNoAxesCombined, group: "Finance" },
];

const highlights = [
  { icon: Truck, title: 'Book and track shipments', detail: 'Shipment booking, courier costs and delivery updates from one workspace.' },
  { icon: BotMessageSquare, title: 'Message customers smarter', detail: 'WhatsApp inbox and AI-assisted messaging workflows.' },
  { icon: Mic, title: 'Pick orders hands-free', detail: 'Voice-assisted warehouse picking with barcode and expiry tools.' },
  { icon: Sparkles, title: 'Ask NORA', detail: 'Quick analysis and intelligent assistance across operational workflows.' },
];

export default function PublicAddonCatalog() {
  return <section id="addons" aria-labelledby="addons-heading" className="scroll-mt-24 border-y border-white/10 bg-[#0b1627]/75 py-20 sm:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Discover CentralHub capabilities</p>
      <h2 id="addons-heading" className="mt-4 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Everything your business needs. One connected dashboard.</h2>
      <p className="mt-5 max-w-4xl text-base leading-8 text-slate-300">From order fulfilment and WhatsApp messaging to NORA, marketing, inventory, banking and accounting, explore the tools that bring your business operations together.</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {highlights.map(({icon:Icon,title,detail})=><article key={title} className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#123447] via-[#10243a] to-[#0b1729] p-6">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10"><Icon aria-hidden="true" className="h-6 w-6 text-cyan-300"/></span>
          <h3 className="mt-5 text-xl font-black text-white">{title}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">{detail}</p>
        </article>)}
      </div>

      <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">The complete feature range</p><h3 className="mt-2 text-2xl font-black text-white sm:text-3xl">Explore what CentralHub can do</h3></div>
        <a href="#interactive-demo" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-5 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-300/20">Try sample workflows <ArrowRight aria-hidden="true" className="h-4 w-4"/></a>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {features.map(({icon:Icon,title,description,group})=><article key={title} className="flex flex-col rounded-2xl border border-white/10 bg-[#101f34] p-5 transition hover:border-cyan-300/35 hover:bg-[#122b40]">
          <div className="flex items-start justify-between gap-2"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10"><Icon aria-hidden="true" className="h-5 w-5 text-cyan-300"/></span><span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-200">{group}</span></div>
          <h4 className="mt-5 text-base font-extrabold leading-6 text-white">{title}</h4><p className="mt-3 flex-1 text-sm leading-7 text-slate-300">{description}</p>
          <a href="#interactive-demo" className="mt-5 inline-flex min-h-10 w-fit items-center gap-2 text-xs font-bold text-cyan-200 hover:underline">Explore the demo <ArrowRight aria-hidden="true" className="h-3.5 w-3.5"/></a>
        </article>)}
      </div>
      <div className="mt-8 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.045] p-4 text-xs leading-6 text-slate-300">
        <p className="font-bold text-cyan-100">Availability & service limits</p>
        <p className="mt-1">“Unlimited shipment booking” describes a high-volume booking workflow, not unlimited courier capacity or free shipments; actual bookings, charges and service limits depend on the carrier contract. The 25-platform marketing figure is an integration roadmap, not 25 verified live connections; live provider implementations currently focus on Google and Meta. Messaging, banking, customer updates and AI features require applicable accounts, permissions and configuration. Financial outputs may require professional review. Public demos use fictional data.</p>
      </div>
    </div>
  </section>;
}

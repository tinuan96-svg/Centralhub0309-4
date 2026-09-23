import { ArrowRight, Barcode, BotMessageSquare, BookOpenCheck, CalendarClock, Calculator, ChartNoAxesCombined, ClipboardList, Landmark, Megaphone, MessageCircle, Mic, Sparkles, Store, Truck, CreditCard, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';

type Feature = { title: string; description: string; icon: LucideIcon; group: string; image: string; badge: string; alt: string };
const features: Feature[] = [
  { title: "Unlimited shipment booking", description: "Shipment booking at scale; actual booking volume, rates and carrier restrictions depend on your courier contract.", icon: Truck, group: "Shipping", image: "/feature-visuals/unlimited-shipment-booking.svg", badge: "UNLIMITED", alt: "Illustration of CentralHub sample shipment booking queue" },
  { title: "Inbuilt WhatsApp message system", description: "Manage configured WhatsApp Business conversations from CentralHub's customer-care inbox.", icon: MessageCircle, group: "Customer care", image: "/feature-visuals/whatsapp-messaging.svg", badge: "WHATSAPP", alt: "Illustration of a sample WhatsApp customer care inbox" },
  { title: "AI customer messaging system", description: "Assist with customer replies and messaging workflows, with appropriate setup, permissions and human review.", icon: BotMessageSquare, group: "Customer care", image: "/feature-visuals/ai-customer-messaging.svg", badge: "AI ASSISTED", alt: "Illustration of customer question and AI-assisted draft reply workflow" },
  { title: "AI voice assistance for order picking", description: "Support warehouse pickers with spoken instructions, voice commands and picking progress.", icon: Mic, group: "Warehouse", image: "/feature-visuals/voice-order-picking.svg", badge: "VOICE PICKING", alt: "Illustration of voice-assisted warehouse picking with example order" },
  { title: "25 marketing platform integrations", description: "A 25-platform integration roadmap; verified live marketing API modules currently centre on Google and Meta.", icon: Megaphone, group: "Marketing", image: "/feature-visuals/marketing-platforms.svg", badge: "25-PLATFORM ROADMAP", alt: "Illustration of the CentralHub marketing platform directory and provider tiles" },
  { title: "Multi-store integration", description: "Connect multiple stores while preserving store-level permissions, reporting and operational visibility.", icon: Store, group: "Operations", image: "/feature-visuals/multi-store.svg", badge: "MULTI-STORE", alt: "Illustration of three example stores in one connected dashboard" },
  { title: "NORA — AI assistance for quick analysis", description: "Ask NORA for operational summaries and quick insights when relevant connected data is available.", icon: Sparkles, group: "Intelligence", image: "/nora-secure-access.webp", badge: "NORA AI", alt: "Approved NORA artwork featuring a glowing blue AI orb" },
  { title: "Shipment tracking, costs & live customer updates", description: "Monitor tracking and shipping costs, with customer notifications through configured courier and messaging services.", icon: Truck, group: "Shipping", image: "/feature-visuals/shipment-tracking.svg", badge: "LIVE UPDATES", alt: "Illustration of sample parcel tracking and customer notification journey" },
  { title: "Banking integration", description: "Import statements or connect supported banking sources to review transactions and reconciliation.", icon: Landmark, group: "Finance", image: "/feature-visuals/banking-integration.svg", badge: "BANKING", alt: "Illustration of sample bank transactions and reconciliation statuses" },
  { title: "VAT management", description: "Organise VAT-related transactions, reporting and checks, with final filings subject to accountant review.", icon: Calculator, group: "Finance", image: "/feature-visuals/vat-management.svg", badge: "VAT", alt: "Illustration of fictional VAT reporting figures pending review" },
  { title: "Accounting information, P&L & balance sheet", description: "Review the chart of accounts, ledgers, profit and loss, and balance-sheet-related reporting.", icon: BookOpenCheck, group: "Accounting", image: "/feature-visuals/accounting.svg", badge: "P&L + BALANCE SHEET", alt: "Illustration of sample profit and loss and balance sheet information" },
  { title: "Barcode system", description: "Scan product barcodes to support stock lookup, goods receiving and picking accuracy.", icon: Barcode, group: "Inventory", image: "/feature-visuals/barcode-system.svg", badge: "BARCODE", alt: "Illustration of a product barcode and sample verified stock" },
  { title: "Expiry date management", description: "Track expiry dates and batches so stock needing attention is easier to identify.", icon: CalendarClock, group: "Inventory", image: "/feature-visuals/expiry-management.svg", badge: "EXPIRY ALERTS", alt: "Illustration of sample batch expiry dates and alerts" },
  { title: "Supplier management & purchase orders", description: "Organise suppliers, purchasing plans, purchase orders and goods-received workflows.", icon: ClipboardList, group: "Purchasing", image: "/feature-visuals/supplier-purchase-orders.svg", badge: "SUPPLIERS + PO", alt: "Illustration of example supplier purchase order details" },
  { title: "AI marketing & SEO", description: "Support campaign and product-content creation with AI assistance and human approval.", icon: Search, group: "Growth", image: "/feature-visuals/ai-marketing-seo.svg", badge: "AI MARKETING", alt: "Illustration of an example SEO keyword and content review" },
  { title: "Pricing management", description: "Analyse costs, margins and competitor signals with controlled pricing approvals.", icon: CreditCard, group: "Pricing", image: "/feature-visuals/pricing-management.svg", badge: "PRICING", alt: "Illustration of example selling price, costs and margin approval" },
  { title: "Finance management", description: "Bring expenses, cashflow, invoices, supplier payables and profitability into one workspace.", icon: ChartNoAxesCombined, group: "Finance", image: "/feature-visuals/finance-management.svg", badge: "FINANCE", alt: "Illustration of sample cashflow chart and financial overview" },
];

const highlights = [
  { icon: Truck, title: 'Unlimited Shipment Booking', detail: 'High-volume booking, tracking and customer updates — subject to courier terms and capacity.', image: '/feature-visuals/unlimited-shipment-booking.svg', badge: 'UNLIMITED' },
  { icon: BotMessageSquare, title: 'AI Customer Messaging', detail: 'Integrated WhatsApp inbox and AI-assisted messages with appropriate review.', image: '/feature-visuals/ai-customer-messaging.svg', badge: 'AI-POWERED' },
  { icon: Mic, title: 'AI Voice Order Picking', detail: 'Voice-assisted picking with barcode and expiry management.', image: '/feature-visuals/voice-order-picking.svg', badge: 'VOICE' },
  { icon: Sparkles, title: 'NORA — Quick AI Analysis', detail: 'Fast operational summaries and intelligent assistance across connected workflows.', image: '/nora-secure-access.webp', badge: 'NORA AI' },
];

export default function PublicAddonCatalog() {
  return <section id="addons" aria-labelledby="addons-heading" className="scroll-mt-24 border-y border-white/10 bg-[#0b1627]/75 py-20 sm:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Discover CentralHub capabilities</p>
      <h2 id="addons-heading" className="mt-4 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Everything your business needs. One connected dashboard.</h2>
      <p className="mt-5 max-w-4xl text-base leading-8 text-slate-300">From order fulfilment and WhatsApp messaging to NORA, marketing, inventory, banking and accounting, explore the tools that bring your business operations together.</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {highlights.map(({icon:Icon,title,detail,image,badge})=><article key={title} className="group overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#123447] via-[#10243a] to-[#0b1729]">
          <div className="relative aspect-[16/10] overflow-hidden border-b border-cyan-300/15 bg-[#081827]">
            <Image src={image} alt={image.endsWith('.webp') ? 'Approved NORA AI artwork' : title + ' feature illustration using fictional sample data'} width={640} height={360} sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.025]" unoptimized loading="lazy"/>
            <span className="absolute left-3 top-3 rounded-lg border border-cyan-300/35 bg-[#061623]/90 px-2.5 py-1.5 text-[10px] font-black tracking-wide text-cyan-200">{badge}</span>
          </div>
          <div className="p-5">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10"><Icon aria-hidden="true" className="h-5 w-5 text-cyan-300"/></span>
            <h3 className="text-xl font-black text-white">{title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">{detail}</p>
          </div>
        </article>)}
      </div>

      <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">The complete feature range</p><h3 className="mt-2 text-2xl font-black text-white sm:text-3xl">Explore what CentralHub can do</h3></div>
        <a href="#interactive-demo" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-5 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-300/20">Try sample workflows <ArrowRight aria-hidden="true" className="h-4 w-4"/></a>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {features.map(({icon:Icon,title,description,group,image,badge,alt})=><article key={title} className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101f34] transition hover:border-cyan-300/35 hover:bg-[#122b40]">
          <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/10 bg-[#071727]">
            <Image src={image} alt={alt} width={640} height={360} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.025]" loading="lazy" unoptimized/>
            <span className="absolute left-3 top-3 max-w-[85%] rounded-lg border border-cyan-300/35 bg-[#061623]/90 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">{badge}</span>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-2"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10"><Icon aria-hidden="true" className="h-5 w-5 text-cyan-300"/></span><span className="text-right text-[10px] font-extrabold uppercase tracking-wider text-cyan-200">{group}</span></div>
            <h4 className="mt-4 text-base font-extrabold leading-6 text-white">{title}</h4><p className="mt-3 flex-1 text-sm leading-7 text-slate-300">{description}</p>
            <a href="#interactive-demo" className="mt-5 inline-flex min-h-10 w-fit items-center gap-2 text-xs font-bold text-cyan-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">Explore sample workflows <ArrowRight aria-hidden="true" className="h-3.5 w-3.5"/></a>
          </div>
        </article>)}
      </div>
      <p className="mt-5 text-xs leading-6 text-slate-400">Feature visuals are illustrative UI previews with fictional sample data, not verified screenshots or live integration status. The approved NORA artwork is used without generating a replacement.</p>
      <div className="mt-8 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.045] p-4 text-xs leading-6 text-slate-300">
        <p className="font-bold text-cyan-100">Availability & service limits</p>
        <p className="mt-1">“Unlimited shipment booking” describes a high-volume booking workflow, not unlimited courier capacity or free shipments; actual bookings, charges and service limits depend on the carrier contract. The 25-platform marketing figure is an integration roadmap, not 25 verified live connections; live provider implementations currently focus on Google and Meta. Messaging, banking, customer updates and AI features require applicable accounts, permissions and configuration. Financial outputs may require professional review. Public demos use fictional data.</p>
      </div>
    </div>
  </section>;
}

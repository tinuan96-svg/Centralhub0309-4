'use client';

import { useState } from 'react';
import { ArrowRight, BarChart3, Boxes, Building2, CheckCircle2, ClipboardList, CreditCard, Headphones, LayoutDashboard, Megaphone, PackageCheck, Radar, ShoppingCart, Sparkles, Truck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Area = { id: string; name: string; icon: LucideIcon; headline: string; detail: string; bullets: string[]; cards: { icon: LucideIcon; title: string; detail: string }[] };
const areas: Area[] = [
  { id: 'command', name: 'Command Centre', icon: LayoutDashboard, headline: 'See what matters. Act from one place.', detail: 'Explore a connected view of stores, sales, orders, stock, alerts and performance.', bullets: ['Executive overview', 'Live operational widgets', 'Store-by-store visibility'],
    cards: [{icon:LayoutDashboard,title:'Executive dashboard',detail:'Sales, activity and key operations at a glance.'},{icon:ShoppingCart,title:'Order monitoring',detail:'Order queue and synchronisation activity.'},{icon:Radar,title:'Security radar',detail:'Security and site-health signals.'},{icon:BarChart3,title:'Business analytics',detail:'Trends and operational reports.'}] },
  { id: 'sales', name: 'Sales & Customers', icon: ShoppingCart, headline: 'From order to delivery — one connected flow.', detail: 'Keep sales, customer records, picking, packing, shipping and support conversations together.', bullets: ['Online and in-store workflows', 'Picking, packing and tracking', 'Customers, inbox and tickets'],
    cards: [{icon:ClipboardList,title:'Order workspace',detail:'Review orders and processing stages.'},{icon:PackageCheck,title:'Picking & packing',detail:'Move orders through fulfilment.'},{icon:Truck,title:'Shipping & tracking',detail:'Manage dispatch and tracking.'},{icon:Headphones,title:'Customer support',detail:'Conversations, templates and support tickets.'}] },
  { id: 'inventory', name: 'Stock & Purchasing', icon: Boxes, headline: 'Know your stock. Plan what comes next.', detail: 'Products, warehouses, barcode workflows, suppliers and replenishment planning in one workspace.', bullets: ['Products, brands and categories', 'Stock movements and warehouses', 'Purchasing and supplier comparison'],
    cards: [{icon:Boxes,title:'Product manager',detail:'Catalogue, product approvals and bulk management.'},{icon:PackageCheck,title:'Stock controls',detail:'Movements, stock audits, expiry and bins.'},{icon:ClipboardList,title:'Purchase planning',detail:'Replenishment, purchase orders and goods received.'},{icon:Building2,title:'Supplier tools',detail:'Prices, comparisons and invoices.'}] },
  { id: 'finance', name: 'Finance & Pricing', icon: CreditCard, headline: 'Know your costs. Understand your margins.', detail: 'Bring banking, reconciliation, supplier payables, accounting reports and price approvals closer together.', bullets: ['Transactions and reconciliation', 'Profit, P&L and VAT views', 'Pricing analysis and approvals'],
    cards: [{icon:CreditCard,title:'Banking and finance',detail:'Transactions, expenses and cashflow.'},{icon:ClipboardList,title:'Reconciliation',detail:'Import and review bank transactions.'},{icon:BarChart3,title:'Profitability',detail:'Product, customer and order insights.'},{icon:CheckCircle2,title:'Pricing controls',detail:'Competitive signals with approval workflows.'}] },
  { id: 'growth', name: 'Marketing & Growth', icon: Megaphone, headline: 'Connect campaigns to customer insight.', detail: 'Explore promotions, campaign planning, marketing channels, SEO and website analytics.', bullets: ['Campaigns, segments and promotions', 'Website and app analytics', 'SEO, product feeds and journeys'],
    cards: [{icon:Megaphone,title:'Campaign centre',detail:'Plan campaigns and promotions.'},{icon:BarChart3,title:'Traffic analytics',detail:'Visitor, acquisition and ecommerce reports.'},{icon:Users,title:'Customer journeys',detail:'Explore engagement and customer segments.'},{icon:Sparkles,title:'Marketing AI',detail:'Creative and SEO workflow assistance.'}] },
  { id: 'intelligence', name: 'AI & Intelligence', icon: Sparkles, headline: 'Go beyond a dashboard.', detail: 'Advanced tools help you interpret signals, monitor operations and keep decisions under your control.', bullets: ['NORA voice and AI assistant', 'Competitor and price intelligence', 'Automation, monitoring and approvals'],
    cards: [{icon:Sparkles,title:'NORA assistant',detail:'AI and voice-assisted operational workflows.'},{icon:BarChart3,title:'Competitor intelligence',detail:'Product and market comparison signals.'},{icon:CheckCircle2,title:'Automation controls',detail:'Review and control automated workflows.'},{icon:Radar,title:'Site health and security',detail:'System status and incident monitoring.'}] },
];

export default function PublicFeatureShowcase() {
  const [selected, setSelected] = useState(0);
  const active = areas[selected];
  return <section id="platform" aria-labelledby="platform-heading" className="scroll-mt-24 border-y border-white/10 bg-[#091728] py-20 sm:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Explore the platform</p>
      <h2 id="platform-heading" className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">One workspace. Every moving part of your business.</h2>
      <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300">Choose a business area to explore CentralHub's connected capabilities. Access to particular features and third-party services depends on your configuration and permissions.</p>
      <div role="tablist" aria-label="CentralHub business areas" className="mt-9 flex gap-2 overflow-x-auto pb-3">
        {areas.map((area,index) => {const Icon=area.icon; const current=index===selected; return <button type="button" role="tab" key={area.id} id={'platform-tab-'+area.id} aria-selected={current} aria-controls="platform-panel" tabIndex={current?0:-1} onClick={()=>setSelected(index)} onKeyDown={(e)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?areas.length-1:(selected+(e.key==='ArrowRight'?1:-1)+areas.length)%areas.length;setSelected(next);document.getElementById('platform-tab-'+areas[next].id)?.focus()}} className={'inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 '+(current?'border-cyan-300/50 bg-cyan-300 text-slate-950':'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10')}><Icon aria-hidden="true" className="h-4 w-4"/>{area.name}</button>})}
      </div>
      <div id="platform-panel" role="tabpanel" aria-labelledby={'platform-tab-'+active.id} className="mt-5 grid overflow-hidden rounded-[1.6rem] border border-cyan-300/20 bg-[#0c1a2c] lg:grid-cols-[0.95fr_1.05fr]">
        <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{active.name} / CentralHub</p>
          <h3 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">{active.headline}</h3>
          <p className="mt-5 text-base leading-8 text-slate-300">{active.detail}</p>
          <div className="mt-7 space-y-3">{active.bullets.map(b=><div key={b} className="flex items-start gap-3 text-sm text-slate-200"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300"/>{b}</div>)}</div>
          <a href="#interactive-demo" className="mt-8 inline-flex min-h-11 w-fit items-center gap-2 text-sm font-bold text-cyan-200 hover:underline">Try the interactive demo <ArrowRight aria-hidden="true" className="h-4 w-4"/></a>
        </div>
        <div className="min-w-0 border-t border-white/10 bg-[#081321] p-4 sm:p-7 lg:border-l lg:border-t-0">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101e31]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><span className="text-xs font-bold text-slate-300">CentralHub / {active.name}</span><span className="rounded-lg border border-cyan-300/20 px-2 py-1 text-[10px] font-bold text-cyan-200">FEATURE PREVIEW</span></div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">{active.cards.map(({icon:Icon,title,detail})=><div key={title} className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><Icon aria-hidden="true" className="h-6 w-6 text-cyan-300"/><h4 className="mt-4 font-bold text-white">{title}</h4><p className="mt-2 text-xs leading-6 text-slate-300">{detail}</p></div>)}</div>
          </div>
          <p className="mt-3 text-xs text-slate-400">Illustrative product overview. No customer information or real-time business records are displayed.</p>
        </div>
      </div>
    </div>
  </section>;
}

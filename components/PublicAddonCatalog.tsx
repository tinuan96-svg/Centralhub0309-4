import { ArrowRight, BarChart3, Bell, Building2, CreditCard, FileText, Megaphone, MessageCircle, Mic, Package, Radar, ScanBarcode, Sparkles, Truck, Workflow } from 'lucide-react';

const tools = [
  {icon:Mic,name:'NORA voice & AI assistant',detail:'Explore AI-assisted business tasks and voice-driven workflows.',area:'AI'},
  {icon:Radar,name:'Security radar & site health',detail:'Review security signals, incidents and technical reliability checks.',area:'Monitoring'},
  {icon:BarChart3,name:'Competitor intelligence',detail:'Compare market signals with approval-controlled pricing decisions.',area:'Intelligence'},
  {icon:Package,name:'Backorder & purchase planning',detail:'Plan stock replenishment, purchasing and goods received.',area:'Procurement'},
  {icon:ScanBarcode,name:'Barcodes & warehouse control',detail:'Manage stock movements, bins, product scans and inventory audits.',area:'Stock control'},
  {icon:Truck,name:'Picking, packing & tracking',detail:'Organise fulfilment and track dispatch activity.',area:'Fulfilment'},
  {icon:CreditCard,name:'Finance & bank reconciliation',detail:'Explore cashflow, reconciliation, expenses, VAT and profitability.',area:'Finance'},
  {icon:MessageCircle,name:'Support inbox & WhatsApp',detail:'Manage customer conversations, tickets and channel integrations.',area:'Customer care'},
  {icon:Megaphone,name:'Campaigns, promotions & SEO',detail:'Plan marketing campaigns, customer segments and product feeds.',area:'Growth'},
  {icon:Workflow,name:'Automation control centre',detail:'Review and manage controlled operational automations.',area:'Automation'},
  {icon:FileText,name:'Reporting & Google Analytics',detail:'Explore website, order, revenue and app-performance reporting.',area:'Analytics'},
  {icon:Bell,name:'Alerts & synchronisation',detail:'Monitor store connections, order sync and notifications.',area:'Operations'},
  {icon:Building2,name:'Multi-store administration',detail:'Configure stores and manage assigned access and visibility.',area:'Management'},
  {icon:Sparkles,name:'Marketing & support AI',detail:'Explore AI assistance for creative, customer care and insight workflows.',area:'Intelligence'},
];

export default function PublicAddonCatalog() {
  return <section id="addons" aria-labelledby="addons-heading" className="scroll-mt-24 border-y border-white/10 bg-[#0b1627]/70 py-20 sm:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Specialist capabilities</p>
      <h2 id="addons-heading" className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Discover what else your dashboard can do.</h2>
      <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300">Explore advanced CentralHub modules, from intelligent purchasing to security, finance, marketing and assisted workflows. Feature access depends on your business configuration, permissions and connected external services.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tools.map(({icon:Icon,name,detail,area})=><article key={name} className="rounded-2xl border border-white/10 bg-[#101f34] p-5 transition hover:border-cyan-300/40 hover:bg-[#122b40]">
          <div className="flex items-center justify-between gap-2"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10"><Icon aria-hidden="true" className="h-5 w-5 text-cyan-300"/></span><span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-200">{area}</span></div>
          <h3 className="mt-5 text-base font-extrabold text-white">{name}</h3><p className="mt-3 text-sm leading-7 text-slate-300">{detail}</p>
          <a href="#interactive-demo" className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-cyan-200 hover:underline">Explore the demo <ArrowRight aria-hidden="true" className="h-3.5 w-3.5"/></a>
        </article>)}
      </div>
      <p className="mt-6 text-xs leading-6 text-slate-400">Illustrations do not mean all modules or third-party connections are enabled for every account. The public demo performs no real operations.</p>
    </div>
  </section>;
}

'use client';

import { useMemo, useState } from 'react';
import { Activity, ArrowRight, BarChart3, Boxes, CheckCircle2, ClipboardList, CreditCard, Headphones, LayoutDashboard, Megaphone, PackageCheck, Radar, RotateCcw, ShoppingCart, Sparkles, Truck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Product = { id: string; name: string; price: number; cost: number; stock: number; reorderAt: number };
type Stage = 'New' | 'Picking' | 'Packed' | 'Dispatched';
type Sale = { id: string; name: string; qty: number; price: number; cost: number; channel: 'Online' | 'In-store'; stage: Stage };
type View = 'overview' | 'orders' | 'inventory' | 'finance' | 'marketing' | 'intelligence';
const originalProducts: Product[] = [
  { id:'rice', name:'Matta Rice · 5 kg', price:12.5, cost:8.2, stock:18, reorderAt:8 },
  { id:'oil', name:'Coconut Oil · 1 L', price:7.8, cost:5.1, stock:10, reorderAt:6 },
  { id:'chips', name:'Banana Chips · 400 g', price:3.6, cost:2.15, stock:24, reorderAt:10 },
];
const stages: Stage[] = ['New', 'Picking', 'Packed', 'Dispatched'];
const tabs: {id:View;label:string;icon:LucideIcon}[] = [
  {id:'overview',label:'Overview',icon:LayoutDashboard},{id:'orders',label:'Orders & sales',icon:ShoppingCart},
  {id:'inventory',label:'Inventory',icon:Boxes},{id:'finance',label:'Finance',icon:CreditCard},
  {id:'marketing',label:'Marketing',icon:Megaphone},{id:'intelligence',label:'AI & security',icon:Sparkles},
];
const pounds = (value:number) => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value);
const intro = 'Fictional sample store · browser-only simulation. No live data, real payments, messages or stock changes.';

export default function PublicInteractiveDemo() {
  const [view,setView] = useState<View>('overview');
  const [products,setProducts] = useState<Product[]>(()=>originalProducts.map(p=>({...p})));
  const [orders,setOrders] = useState<Sale[]>([]);
  const [chosen,setChosen] = useState('rice');
  const [qty,setQty] = useState(1);
  const [channel,setChannel] = useState<'Online'|'In-store'>('In-store');
  const [campaign,setCampaign] = useState(false);
  const [ticketReplied,setTicketReplied] = useState(false);
  const [period,setPeriod] = useState<7|30>(7);
  const [activity,setActivity] = useState<string[]>(['Demo workspace ready — choose an action to see what changes.']);
  const [message,setMessage] = useState('Choose a product and create a sale to see the connected workflow.');

  const selected = products.find(p=>p.id===chosen) ?? products[0];
  const addedRevenue = orders.reduce((sum,o)=>sum+o.price*o.qty,0);
  const addedCost = orders.reduce((sum,o)=>sum+o.cost*o.qty,0);
  const lowStock = products.filter(p=>p.stock<=p.reorderAt);
  const totals = {revenue:184.8+addedRevenue, orders:12+orders.length, stock:products.reduce((sum,p)=>sum+p.stock,0), margin:57.1+addedRevenue-addedCost};
  const latest = orders[orders.length-1];
  const aiTips = useMemo(()=>[
    lowStock.length?lowStock.map(p=>p.name+' has '+p.stock+' left; review a sample reorder.').join(' '):'No example product has reached its reorder threshold.',
    orders.some(o=>o.stage!=='Dispatched')?'There are '+orders.filter(o=>o.stage!=='Dispatched').length+' simulated orders still in fulfilment.':'No simulated orders currently await fulfilment.',
    'Pricing suggestions, supplier actions and third-party connections require review and configuration in the real system.',
  ],[lowStock,orders]);

  const record = (note:string) => {setMessage(note);setActivity(current=>[note,...current].slice(0,5));};
  const createSale = () => {
    const product=products.find(p=>p.id===chosen);
    if(!product||qty<1||qty>product.stock) {record('Sample stock is insufficient. Try another item or replenish inventory.');return;}
    const sale:Sale={id:'DEMO-'+String(101+orders.length),name:product.name,qty,price:product.price,cost:product.cost,channel,stage:'New'};
    setOrders(current=>[...current,sale]);
    setProducts(current=>current.map(p=>p.id===chosen?{...p,stock:p.stock-qty}:p));
    record(sale.id+' created · '+qty+' × '+product.name+' · '+pounds(product.price*qty)+' · sample stock reserved.');
    setView('orders');
  };
  const advance = (id:string) => {
    const order=orders.find(o=>o.id===id);
    if(!order||order.stage==='Dispatched')return;
    const next=stages[stages.indexOf(order.stage)+1];
    setOrders(current=>current.map(o=>o.id===id?{...o,stage:next}:o));
    record(id+' moved to '+next+'. This updates the sample order workflow only.');
  };
  const replenish=(id:string)=>{
    const product=products.find(p=>p.id===id);
    if(!product)return;
    setProducts(current=>current.map(p=>p.id===id?{...p,stock:p.stock+20}:p));
    record('Example goods received: +20 '+product.name+'. Stock level refreshed.');
  };
  const reset=()=>{
    setProducts(originalProducts.map(p=>({...p})));setOrders([]);setQty(1);setChosen('rice');setChannel('In-store');setCampaign(false);setTicketReplied(false);setPeriod(7);setView('overview');
    setActivity(['Demo reset to its starting sample data.']);setMessage('Demo reset. Make a sample sale to begin again.');
  };
  const kpis=[
    {label:'Example daily sales',value:pounds(totals.revenue),icon:CreditCard},
    {label:'Example daily orders',value:String(totals.orders),icon:ShoppingCart},
    {label:'Sample stock units',value:String(totals.stock),icon:Boxes},
    {label:'Illustrative gross profit',value:pounds(totals.margin),icon:BarChart3},
  ];
  const demoButton='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';
  const minorButton='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';

  return <section id="interactive-demo" aria-labelledby="interactive-demo-heading" className="scroll-mt-24 bg-[#07111f] py-20 sm:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Hands-on product demonstration</p>
          <h2 id="interactive-demo-heading" className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Try a business day in CentralHub.</h2>
          <p className="mt-5 text-base leading-8 text-slate-300">Create a sample sale, move it through fulfilment, see stock and revenue change, then explore the connected modules. Every action runs on invented demo data in your browser.</p>
        </div>
        <button type="button" onClick={reset} className={minorButton+' shrink-0 self-start'}><RotateCcw aria-hidden="true" className="h-4 w-4"/>Reset demo</button>
      </div>
      <div className="mt-9 overflow-hidden rounded-[1.6rem] border border-cyan-300/25 bg-[#0b1729] shadow-[0_25px_90px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#111f32] px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10"><LayoutDashboard aria-hidden="true" className="h-5 w-5 text-cyan-300"/></span><div><p className="font-black text-white">CentralHub <span className="text-cyan-300">Demo</span></p><p className="text-xs text-slate-300">Sample Shop · fictional business</p></div></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-200"><span className="h-2 w-2 rounded-full bg-amber-300"/>SIMULATION · NOT LIVE</span>
        </div>
        <div className="border-b border-white/10 bg-[#0a1525] px-4 py-3 text-xs leading-6 text-slate-300 sm:px-6">{intro}</div>
        <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-3 sm:px-5" role="tablist" aria-label="Demo dashboard modules">
          {tabs.map(({id,label,icon:Icon})=>{const active=view===id;return <button type="button" key={id} role="tab" aria-selected={active} aria-controls="demo-panel" id={'demo-tab-'+id} onClick={()=>setView(id)} className={'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 '+(active?'border-cyan-300/40 bg-cyan-300 text-slate-950':'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10')}><Icon aria-hidden="true" className="h-4 w-4"/>{label}</button>})}
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_285px]">
          <div id="demo-panel" role="tabpanel" aria-labelledby={'demo-tab-'+view} className="min-w-0 p-4 sm:p-6">
            {(view==='overview'||view==='finance')&&<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{kpis.map(({label,value,icon:Icon})=><div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><Icon aria-hidden="true" className="h-5 w-5 text-cyan-300"/><p className="mt-3 text-xs leading-5 text-slate-300">{label}</p><p className="mt-1 break-all text-xl font-black text-white sm:text-2xl">{value}</p></div>)}</div>}
            {view==='overview'&&<div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><h3 className="font-extrabold text-white">Watch one sale connect the whole business</h3><p className="mt-2 text-sm leading-7 text-slate-300">The demo starts with 12 example orders and 3 sample products. Create a new order and see revenue, stock and fulfilment change together.</p><button type="button" onClick={()=>setView('orders')} className={demoButton+' mt-5'}>Make a sample sale <ArrowRight aria-hidden="true" className="h-4 w-4"/></button></div>
              <div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><h3 className="font-extrabold text-white">Your demo at a glance</h3><p className="mt-3 text-sm text-slate-300">Sample orders created: <strong className="text-white">{orders.length}</strong></p><p className="mt-2 text-sm text-slate-300">Products needing replenishment: <strong className="text-white">{lowStock.length}</strong></p><p className="mt-2 text-sm text-slate-300">Orders still in fulfilment: <strong className="text-white">{orders.filter(o=>o.stage!=='Dispatched').length}</strong></p><button type="button" onClick={()=>setView('inventory')} className={minorButton+' mt-5'}>View sample inventory <ArrowRight aria-hidden="true" className="h-4 w-4"/></button></div>
            </div>}
            {view==='orders'&&<div>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-black text-white">Sample checkout and fulfilment</h3><span className="text-xs text-cyan-200">No payment or shipping is processed</span></div>
              <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#101f33] p-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-200">Choose an example product<select value={chosen} onChange={e=>setChosen(e.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-slate-600 bg-[#07111f] px-3 py-2 text-sm text-white">{products.map(p=><option value={p.id} key={p.id}>{p.name} · {pounds(p.price)} · {p.stock} left</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-200">Quantity<select value={qty} onChange={e=>setQty(Number(e.target.value))} className="mt-2 block min-h-11 w-full rounded-lg border border-slate-600 bg-[#07111f] px-3 py-2 text-sm text-white">{[1,2,3].map(v=><option value={v} key={v}>{v}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-200">Channel<select value={channel} onChange={e=>setChannel(e.target.value as 'Online'|'In-store')} className="mt-2 block min-h-11 w-full rounded-lg border border-slate-600 bg-[#07111f] px-3 py-2 text-sm text-white"><option value="In-store">In-store / till</option><option value="Online">Online store</option></select></label>
                <div className="flex flex-col justify-end"><p className="mb-2 text-sm font-bold text-white">Example total: {pounds(selected.price*qty)}</p><button type="button" disabled={selected.stock<qty} onClick={createSale} className={demoButton}>Create sample sale <ArrowRight aria-hidden="true" className="h-4 w-4"/></button></div>
              </div>
              <p className="mt-3 text-xs text-slate-400">Creating a sample order reserves its stock and updates the example sales totals immediately. No customer account is created.</p>
              <h4 className="mt-6 font-extrabold text-white">Sample order queue</h4>
              {orders.length===0?<p className="mt-3 rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-300">Your new demo orders will appear here. Create a sample sale above to try picking, packing and dispatch.</p>:<div className="mt-3 space-y-3">{[...orders].reverse().map(o=><div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4"><div className="min-w-0"><p className="font-bold text-white">{o.id} · {o.name}</p><p className="mt-1 text-xs text-slate-300">{o.qty} unit(s) · {o.channel} · {pounds(o.price*o.qty)}</p><p className="mt-2 text-xs font-semibold text-cyan-200">Stage: {o.stage}</p></div>{o.stage!=='Dispatched'?<button type="button" onClick={()=>advance(o.id)} className={minorButton}>Move to {stages[stages.indexOf(o.stage)+1]} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5"/></button>:<span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300"><CheckCircle2 aria-hidden="true" className="h-4 w-4"/>Demo dispatched</span>}</div>)}</div>}
              <div className="mt-5 rounded-xl border border-white/10 bg-[#101f33] p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-bold text-white">Customer support preview</h4><Headphones aria-hidden="true" className="h-5 w-5 text-cyan-300"/></div><p className="mt-2 text-sm text-slate-300">Fictional customer: “Can you tell me when my order will arrive?”</p>{ticketReplied?<p className="mt-3 text-sm font-semibold text-emerald-300">Example reply saved in this demo. No message was sent.</p>:<button type="button" onClick={()=>{setTicketReplied(true);record('Example support reply drafted — no external message sent.')}} className={minorButton+' mt-3'}>Draft sample response</button>}</div>
            </div>}
            {view==='inventory'&&<div>
              <h3 className="text-lg font-black text-white">Stock & procurement workspace</h3><p className="mt-2 text-sm leading-7 text-slate-300">Create a sale to reduce sample stock. Receive example goods to increase it again. Reorder thresholds update automatically.</p>
              <div className="mt-5 space-y-3">{products.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101f33] p-4"><div><p className="font-bold text-white">{p.name}</p><p className="mt-1 text-xs text-slate-300">Price {pounds(p.price)} · Reorder at {p.reorderAt} units</p><p className={'mt-2 text-sm font-extrabold '+(p.stock<=p.reorderAt?'text-amber-300':'text-emerald-300')}>{p.stock} units · {p.stock<=p.reorderAt?'Reorder review':'Stock available'}</p></div><button type="button" onClick={()=>replenish(p.id)} className={minorButton}>Receive 20 sample units</button></div>)}</div>
              <button type="button" onClick={()=>setView('orders')} className={minorButton+' mt-5'}>Create a sample sale <ArrowRight aria-hidden="true" className="h-4 w-4"/></button>
            </div>}
            {view==='finance'&&<div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><h3 className="font-extrabold text-white">Illustrative P&L snapshot</h3><p className="mt-2 text-sm text-slate-300">Revenue: {pounds(totals.revenue)}</p><p className="mt-2 text-sm text-slate-300">Example cost of goods: {pounds(127.7+addedCost)}</p><p className="mt-2 font-bold text-cyan-200">Example gross profit: {pounds(totals.margin)}</p><p className="mt-3 text-xs text-slate-400">Demonstrates arithmetic only; excludes taxes, fees and business expenses.</p></div><div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><h3 className="font-extrabold text-white">Reconciliation preview</h3><p className="mt-3 text-sm text-slate-300">Example bank line: Supplier payment · £42.00</p><p className="mt-2 text-xs text-amber-200">Classification awaiting review</p><p className="mt-4 text-xs leading-6 text-slate-400">In the real app, imports, reconciliation, reports and price approvals use authenticated finance controls. This public preview does not connect to a bank.</p></div></div>}
            {view==='marketing'&&<div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><Megaphone aria-hidden="true" className="h-6 w-6 text-cyan-300"/><h3 className="mt-4 text-lg font-extrabold text-white">Weekend offers campaign</h3><p className="mt-2 text-sm leading-7 text-slate-300">Example audience: returning customers · Example channel: email · Example offer: 10% off selected snacks.</p><p className="mt-3 text-xs text-slate-300">Status: <strong className={campaign?'text-emerald-300':'text-amber-200'}>{campaign?'Simulated campaign active':'Draft preview'}</strong></p><button type="button" onClick={()=>{setCampaign(c=>!c);record(campaign?'Example campaign returned to draft.':'Example campaign activated in this browser only; no messages sent.')}} className={minorButton+' mt-5'}>{campaign?'Return to demo draft':'Activate sample campaign'}</button></div><div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><BarChart3 aria-hidden="true" className="h-6 w-6 text-cyan-300"/><h3 className="mt-4 text-lg font-extrabold text-white">Illustrative traffic analytics</h3><div className="mt-4 flex gap-2">{([7,30] as const).map(d=><button type="button" key={d} onClick={()=>setPeriod(d)} className={'min-h-9 rounded-lg border px-3 text-xs font-bold '+(period===d?'border-cyan-300 bg-cyan-300 text-slate-950':'border-white/20 text-slate-300')}>{d} days</button>)}</div><p className="mt-5 text-2xl font-black text-white">{period===7?'1,240':'5,610'} <span className="text-xs font-normal text-slate-300">example visits</span></p><p className="mt-2 text-xs leading-6 text-slate-400">Mock figures for explaining dashboards. Not connected to Google Analytics or a marketing provider.</p></div></div>}
            {view==='intelligence'&&<div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><Sparkles aria-hidden="true" className="h-6 w-6 text-cyan-300"/><h3 className="mt-4 text-lg font-extrabold text-white">NORA · example operational briefing</h3><p className="mt-2 text-sm text-slate-300">“What needs attention at my shop?”</p><div className="mt-4 space-y-3">{aiTips.map((tip,i)=><p key={i} className="rounded-lg border border-cyan-300/10 bg-cyan-300/5 p-3 text-xs leading-6 text-slate-200">{tip}</p>)}</div><p className="mt-3 text-xs text-slate-400">Rule-based illustration; no live AI call or autonomous action.</p></div><div className="rounded-xl border border-white/10 bg-[#101f33] p-5"><Radar aria-hidden="true" className="h-6 w-6 text-cyan-300"/><h3 className="mt-4 text-lg font-extrabold text-white">Security & automation preview</h3><p className="mt-3 text-sm text-slate-300">Demo security signals: <strong className="text-emerald-300">No example incidents</strong></p><p className="mt-2 text-sm text-slate-300">Automation mode: <strong className="text-cyan-200">Illustration only</strong></p><p className="mt-4 text-xs leading-6 text-slate-400">The actual security radar and automation controls belong to the protected dashboard. This demo never monitors a real system or performs a background task.</p></div></div>}
            <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3 text-sm leading-6 text-cyan-100">{message}</div>
          </div>
          <aside className="min-w-0 border-t border-white/10 bg-[#081321] p-4 sm:p-5 lg:border-l lg:border-t-0"><div className="flex items-center gap-2 text-sm font-bold text-white"><Activity aria-hidden="true" className="h-4 w-4 text-cyan-300"/> Demo activity</div><p className="mt-2 text-xs leading-6 text-slate-300">Watch the sample workflow respond to your actions.</p><ol className="mt-5 space-y-4">{activity.map((a,i)=><li key={i+'-'+a} className="border-l-2 border-cyan-300/50 pl-3 text-xs leading-6 text-slate-200">{a}</li>)}</ol><div className="mt-6 rounded-xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs font-extrabold uppercase tracking-wider text-cyan-200">Explore next</p><p className="mt-2 text-sm leading-6 text-slate-300">{latest?'Your latest order '+latest.id+' is '+latest.stage+'. Explore how another module responds.':'Create a sample sale first, then explore inventory, fulfilment and finance.'}</p><button type="button" onClick={()=>setView(latest?'inventory':'orders')} className={minorButton+' mt-4'}>{latest?'Check updated stock':'Create a sample sale'} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5"/></button></div></aside>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#101e31] px-4 py-4 text-xs text-slate-300 sm:px-6"><span>All activity resets when you reload the page. No demo data is saved.</span><button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 font-bold text-cyan-200 hover:text-white"><RotateCcw aria-hidden="true" className="h-4 w-4"/>Start again</button></div>
      </div>
    </div>
  </section>;
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  Activity, ArrowRight, BarChart3, Bell, Barcode, Bot, Boxes,
  CheckCircle2, ChevronDown, ClipboardList, CreditCard, FileText,
  LayoutDashboard, LockKeyhole, Megaphone, Menu, MessageCircle,
  Mic, Package, PackageCheck, RefreshCw, Search, ShieldCheck,
  ShoppingBag, Sparkles, Store, Truck, Wallet, X,
} from 'lucide-react';

type Screen = 'overview' | 'orders' | 'products' | 'packing' | 'shipping' |
 'stores' | 'customers' | 'suppliers' | 'marketing' | 'finance' | 'inventory' |
 'customer-care' | 'ai' | 'security' | 'pricing';
type SaleStatus = 'confirmed' | 'picking' | 'picked' | 'packing' | 'packed' | 'shipment_booked' | 'shipped' | 'delivered';
type Sale = { id:string; store:string; customer:string; productId:string; qty:number; total:number; status:SaleStatus; charge:number };
type Product = { id:string; name:string; sku:string; cost:number; price:number; stock:number; store:string; expiry:string };
const stores=[{id:'shop-a',name:'Sample Shop A'},{id:'shop-b',name:'Sample Shop B'}] as const;
const originalProducts:Product[]=[
 {id:'matta',name:'Matta Rice · 5 kg',sku:'DEMO-RICE-05',cost:8.2,price:12.5,stock:18,store:'shop-a',expiry:'2027-03-15'},
 {id:'oil',name:'Coconut Oil · 1 L',sku:'DEMO-OIL-01',cost:5.1,price:7.8,stock:6,store:'shop-a',expiry:'2027-01-08'},
 {id:'chips',name:'Banana Chips · 400 g',sku:'DEMO-CHIPS-04',cost:2.15,price:3.6,stock:22,store:'shop-a',expiry:'2026-12-19'},
 {id:'flour',name:'Puttu Podi · 1 kg',sku:'DEMO-FLOUR-01',cost:1.7,price:2.95,stock:12,store:'shop-b',expiry:'2027-02-22'},
 {id:'spice',name:'Curry Masala · 100 g',sku:'DEMO-MASALA-01',cost:1.1,price:2.2,stock:9,store:'shop-b',expiry:'2027-07-04'},
];
const originalOrders:Sale[]=[
 {id:'DEMO-1001',store:'shop-a',customer:'Sample Customer A',productId:'matta',qty:2,total:25,status:'confirmed',charge:4},
 {id:'DEMO-1002',store:'shop-b',customer:'Sample Customer B',productId:'flour',qty:1,total:2.95,status:'picking',charge:4},
 {id:'DEMO-1003',store:'shop-a',customer:'Sample Customer C',productId:'chips',qty:3,total:10.8,status:'packed',charge:4},
];
const statusFlow:SaleStatus[]=['confirmed','picking','picked','packing','packed','shipment_booked','shipped','delivered'];
const nav:{name:string;icon:string;items:{id:Screen;label:string}[]}[]=[
 {name:'Command Centre',icon:'🏠',items:[{id:'overview',label:'Dashboard'}]},
 {name:'Network & Sales',icon:'🛒',items:[{id:'stores',label:'All Stores'},{id:'orders',label:'Order Queue'},{id:'customers',label:'Customers'}]},
 {name:'Catalog & Inventory',icon:'📦',items:[{id:'products',label:'Product Manager'},{id:'inventory',label:'Inventory Dashboard'}]},
 {name:'Procurement',icon:'🛍️',items:[{id:'suppliers',label:'Suppliers & Purchase Orders'}]},
 {name:'Fulfilment & Shipping',icon:'🚚',items:[{id:'packing',label:'Picking & Packing'},{id:'shipping',label:'Shipment List'}]},
 {name:'Customer & Support',icon:'💬',items:[{id:'customer-care',label:'Support Inbox'}]},
 {name:'Marketing',icon:'📣',items:[{id:'marketing',label:'Marketing Overview'},{id:'pricing',label:'Pricing'}]},
 {name:'Finance',icon:'💷',items:[{id:'finance',label:'Bank Reconciliation & P&L'}]},
 {name:'Intelligence & Security',icon:'🤖',items:[{id:'ai',label:'NORA AI'},{id:'security',label:'Security Radar'}]},
];
const fmt=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);
const statusLabel=(s:SaleStatus)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const demoButton='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed';
const card='ch-panel';
function Panel({title,children,description}:{title:string;children:ReactNode;description?:string}){
 return <section className={card+' min-w-0'}><div className="ch-panel-heading"><div><h3 className="ch-panel-title">{title}</h3>{description&&<p className="ch-muted">{description}</p>}</div></div>{children}</section>;
}
function DemoTable({headers,rows}:{headers:string[];rows:ReactNode[][]}){
 return <div className="overflow-x-auto rounded-xl border border-slate-700/40"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-slate-700/40 bg-slate-800/60"><tr>{headers.map(h=><th key={h} scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/50">{rows.map((r,i)=><tr key={i} className="hover:bg-slate-800/30">{r.map((v,j)=><td key={j} className="px-4 py-3 align-middle text-slate-200">{v}</td>)}</tr>)}</tbody></table></div>;
}
function DemoKpi({label,value,color,sub,icon:Icon}:{label:string;value:string;color:string;sub:string;icon:typeof ShoppingBag}){
 return <article className="ch-panel ch-kpi ch-kpi-compact" style={{'--metric-accent':color} as CSSProperties}>
  <div className="mb-3 flex items-start justify-between gap-2"><p className="ch-kpi-label">{label}</p><span className="ch-kpi-icon"><Icon size={18} aria-hidden="true"/></span></div>
  <p className="ch-kpi-value">{value}</p><p className="ch-comparison">{sub}</p>
 </article>;
}

export default function DemoDashboardClient(){
 const [screen,setScreen]=useState<Screen>('overview');
 const [store,setStore]=useState('all');
 const [period,setPeriod]=useState<'today'|'7days'|'30days'>('today');
 const [products,setProducts]=useState<Product[]>(()=>originalProducts.map(p=>({...p})));
 const [orders,setOrders]=useState<Sale[]>(()=>originalOrders.map(o=>({...o})));
 const [expanded,setExpanded]=useState('Command Centre');
 const [navOpen,setNavOpen]=useState(false);
 const [search,setSearch]=useState('');
 const [productId,setProductId]=useState('matta');
 const [qty,setQty]=useState(1);
 const [channel,setChannel]=useState<'Online'|'In-store'>('Online');
 const [campaign,setCampaign]=useState(false);
 const [customerReply,setCustomerReply]=useState(false);
 const [notifications,setNotifications]=useState(false);
 const [sampleUpdates,setSampleUpdates]=useState<string[]>(['Demo workspace opened · fictional data loaded.']);
 const [note,setNote]=useState('Select a module or create a sample sale to explore the connected workflow.');
 const visibleProducts=products.filter(p=>store==='all'||p.store===store);
 const visibleOrders=orders.filter(o=>store==='all'||o.store===store);
 const pickable=products.filter(p=>p.stock>0&&(store==='all'||p.store===store));
 const choice=pickable.find(p=>p.id===productId)||pickable[0];
 const totalRevenue=visibleOrders.reduce((sum,o)=>sum+o.total+o.charge,0);
 const cogs=visibleOrders.reduce((sum,o)=>sum+(products.find(p=>p.id===o.productId)?.cost||0)*o.qty,0);
 const expenses=visibleOrders.length*1.75;
 const margin=totalRevenue-cogs;
 const pending=visibleOrders.filter(o=>o.status!=='delivered');
 const low=visibleProducts.filter(p=>p.stock<=8);
 const log=(message:string)=>{setNote(message);setSampleUpdates(a=>[message,...a].slice(0,6));};
 const navigate=(target:Screen)=>{setScreen(target);setNavOpen(false);setSearch('');};
 const selectStore=(next:string)=>{setStore(next);const product=products.find(p=>p.stock>0&&(next==='all'||p.store===next));if(product)setProductId(product.id);};
 const createSale=()=>{
  if(!choice||choice.stock<qty||qty<1){log('Insufficient sample stock. Choose another product or receive demo stock.');return;}
  const order:Sale={id:'DEMO-'+String(1001+orders.length),store:choice.store,customer:'Sample Customer '+String(orders.length+1),productId:choice.id,qty,total:Number((choice.price*qty).toFixed(2)),charge:4,status:'confirmed'};
  setOrders(old=>[order,...old]);setProducts(old=>old.map(p=>p.id===choice.id?{...p,stock:p.stock-qty}:p));setScreen('orders');
  log(order.id+' created ('+channel+') · stock reduced by '+qty+' · sample revenue updated. No real order or payment was created.');
 };
 const advance=(id:string)=>{
  const order=orders.find(o=>o.id===id);if(!order||order.status==='delivered')return;
  const next=statusFlow[statusFlow.indexOf(order.status)+1];
  setOrders(old=>old.map(o=>o.id===id?{...o,status:next}:o));log(id+' advanced to '+statusLabel(next)+' · simulated only, no carrier or customer contacted.');
 };
 const receive=(id:string)=>{
  const product=products.find(p=>p.id===id);if(!product)return;
  setProducts(old=>old.map(p=>p.id===id?{...p,stock:p.stock+20}:p));log('Sample goods received: +20 units of '+product.name+'. No supplier order was placed.');
 };
 const reset=()=>{setProducts(originalProducts.map(p=>({...p})));setOrders(originalOrders.map(o=>({...o})));setStore('all');setProductId('matta');setQty(1);setPeriod('today');setCampaign(false);setCustomerReply(false);setScreen('overview');setNote('Demo reset to initial fictional records.');setSampleUpdates(['Demo reset · fictional records restored.']);};
 const title=nav.flatMap(g=>g.items).find(x=>x.id===screen)?.label||'Dashboard';
 const shownOrders=visibleOrders.filter(o=>!search||[o.id,o.customer,o.status].some(v=>v.toLowerCase().includes(search.toLowerCase())));
 const shownProducts=visibleProducts.filter(p=>!search||[p.name,p.sku].some(v=>v.toLowerCase().includes(search.toLowerCase())));
 const countFactor=period==='today'?1:period==='7days'?7:30;
 const renderOrders=(type:'orders'|'packing'|'shipping')=><div className="space-y-4">
  {type==='orders'&&<Panel title="Create sample sale" description="Use the same order-to-stock workflow with fictional data only.">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-xs text-slate-300">Product<select value={choice?.id||''} onChange={e=>setProductId(e.target.value)} className="select-field mt-2 w-full">{pickable.map(p=><option key={p.id} value={p.id}>{p.name} · {fmt(p.price)} · {p.stock} left</option>)}</select></label>
    <label className="text-xs text-slate-300">Quantity<select value={qty} onChange={e=>setQty(Number(e.target.value))} className="select-field mt-2 w-full">{[1,2,3].map(q=><option key={q} value={q}>{q}</option>)}</select></label>
    <label className="text-xs text-slate-300">Sales channel<select value={channel} onChange={e=>setChannel(e.target.value as 'Online'|'In-store')} className="select-field mt-2 w-full"><option>Online</option><option>In-store</option></select></label>
    <div className="flex flex-col justify-end gap-2"><span className="text-xs text-slate-300">Order total: {fmt((choice?.price||0)*qty+4)}</span><button type="button" disabled={!choice||choice.stock<qty} onClick={createSale} className={demoButton}>Create sample sale <ArrowRight size={14}/></button></div>
   </div>
  </Panel>}
  <Panel title={type==='shipping'?'Shipment List':type==='packing'?'Picking & Packing':'Order Queue'} description="Example order references, statuses and customer records.">
   <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search sample orders" placeholder="Search orders..." className="input-field w-full max-w-xs"/><span className="text-xs text-slate-400">{shownOrders.length} demo orders</span></div>
   <DemoTable headers={['Store','Order','Customer','Total','Status','Action']} rows={shownOrders.map(o=>[
     stores.find(s=>s.id===o.store)?.name,
     <span key={o.id} className="font-mono text-xs text-cyan-300">{o.id}</span>,
     o.customer,fmt(o.total+o.charge),
     <span key={o.id+'status'} className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold uppercase text-cyan-200">{statusLabel(o.status)}</span>,
     o.status!=='delivered'?<button key={o.id+'next'} type="button" onClick={()=>advance(o.id)} className={demoButton}>Move to {statusLabel(statusFlow[statusFlow.indexOf(o.status)+1])}</button>:<span key={o.id+'done'} className="text-emerald-300">Sample delivered</span>
   ])}/>
  </Panel>
  {type==='shipping'&&<Panel title="Shipment tracking & costs"><div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300"><span>Example label cost · £4.00 per order</span><span>Booking quota: demo only</span></div><p className="mt-3 text-xs text-slate-400">Booking, tracking and customer messaging shown here are simulated. No courier account or messaging service is contacted.</p></Panel>}
 </div>;
 const renderProducts=()=> <div className="space-y-4"><Panel title={screen==='inventory'?'Inventory Dashboard':'Product Manager'} description="Sample products, stock movements and expiry dates.">
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search sample products" placeholder="Search product or SKU..." className="input-field w-full max-w-xs"/><span className="text-xs text-slate-400">{low.length} low-stock items</span></div>
  <DemoTable headers={['Product','SKU','Price','Stock','Expiry','Action']} rows={shownProducts.map(p=>[
    <span key={p.id} className="font-semibold text-white">{p.name}</span>,p.sku,fmt(p.price),
    <span key={p.id+'stock'} className={p.stock<=8?'font-bold text-amber-300':'font-bold text-cyan-300'}>{p.stock}</span>,p.expiry,
    <button key={p.id+'receive'} type="button" onClick={()=>receive(p.id)} className={demoButton}>Receive 20 units</button>
  ])}/>
 </Panel></div>;
 return <div className="ch-workspace centralhub-desktop-shell flex h-[100dvh] w-full min-w-0 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100" data-section="dashboard">
  {navOpen&&<button aria-label="Close demo navigation" className="fixed inset-0 z-40 bg-black/65 lg:hidden" onClick={()=>setNavOpen(false)} type="button"/>}
  <aside className={'centralhub-sidebar fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[270px] shrink-0 flex-col border-r border-slate-800 bg-slate-950 transition-transform lg:static lg:translate-x-0 '+(navOpen?'translate-x-0':'-translate-x-full')} aria-label="Demo navigation">
   <div className="flex items-center justify-between border-b border-slate-800 p-4"><strong className="text-white">CentralHub <span className="text-cyan-300">DEMO</span></strong><button type="button" className="min-h-10 min-w-10 text-slate-400 lg:hidden" onClick={()=>setNavOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
   <div className="px-4 pt-4"><p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-400">Business navigation</p><p className="mt-1 text-[10px] text-slate-500">Same workspace style · fictional data</p></div>
   <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3 pb-4">{nav.map(g=><div key={g.name}>
    <button type="button" onClick={()=>setExpanded(v=>v===g.name?'':g.name)} className={'flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-wider '+(g.items.some(x=>x.id===screen)?'bg-cyan-500/10 text-cyan-300':'text-slate-400 hover:text-white')} aria-expanded={expanded===g.name}><span>{g.icon} {g.name}</span><span>{expanded===g.name?'−':'+'}</span></button>
    {expanded===g.name&&<div className="ml-3 space-y-0.5 border-l border-slate-800 pl-2">{g.items.map(item=><button type="button" key={item.id} onClick={()=>navigate(item.id)} className={'block min-h-10 w-full rounded-lg px-3 py-2 text-left text-xs '+(screen===item.id?'bg-slate-800 text-white':'text-slate-400 hover:text-slate-200')}>{item.label}</button>)}</div>}
   </div>)}</nav>
   <div className="border-t border-slate-800 p-3"><p className="text-xs font-bold text-white">Demo visitor</p><p className="text-[10px] text-slate-500">No account or data access</p><Link href="/login" className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-cyan-200 hover:text-white">Exit demo <ArrowRight size={14}/></Link></div>
  </aside>

  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
   <header className="sticky top-0 z-30 flex min-h-[64px] shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#0e1326]/95 px-3 backdrop-blur-xl sm:px-6">
    <div className="flex min-w-0 items-center gap-2 sm:gap-4"><button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-200 lg:hidden" onClick={()=>setNavOpen(true)} aria-label="Open demo navigation"><Menu size={20}/></button><h2 className="truncate text-sm font-black uppercase tracking-tight text-white sm:text-lg">🤖 {title}</h2><span className="hidden rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] font-black tracking-wider text-cyan-200 sm:inline">DEMO MODE</span></div>
    <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={()=>setNotifications(x=>!x)} className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300" aria-label="Sample notifications"><Bell size={18}/>{low.length>0&&<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400"/>}</button><Link href="/login" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-cyan-400/30 px-3 text-xs font-bold text-cyan-200 hover:bg-cyan-400/10"><LockKeyhole size={14}/> <span className="hidden sm:inline">Exit demo / Login</span><span className="sm:hidden">Exit</span></Link></div>
   </header>
   {notifications&&<div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-cyan-400/20 bg-slate-900 px-4 py-3 text-xs text-slate-200"><p>Sample alerts: {low.length} low-stock products · {pending.length} active sample orders. No live system is connected.</p><button type="button" onClick={()=>setNotifications(false)} className={demoButton}>Close</button></div>}
   <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2 text-xs text-amber-100"><span><strong>DEMO DATA ONLY</strong> · Visually matched CentralHub workspace · no real orders, payments, courier bookings, messages or database writes.</span><button type="button" onClick={reset} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-400/20 px-3 font-bold hover:bg-amber-400/10"><RefreshCw size={13}/> Reset</button></div>

   <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-24 lg:pb-4">
    <div className="ch-dashboard">
     <div className="ch-dashboard-stack">
      <div className="ch-dashboard-hero"><div><p className="ch-eyebrow">CentralHub / Sample workspace</p><h1 className="ch-dashboard-title">{screen==='overview'?'Executive Overview':title}</h1><p className="ch-muted">Fictional demonstration of the CentralHub business workflow</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={reset} className={demoButton}><RefreshCw size={15}/> Reset demo</button><button type="button" onClick={()=>navigate('orders')} className={demoButton}><ShoppingBag size={15}/> Sample sale</button></div></div>

      <div className="ch-console-toolbar" aria-label="Demo dashboard filters">
       <label className="sr-only" htmlFor="demo-store">Store</label><select id="demo-store" value={store} onChange={e=>selectStore(e.target.value)}><option value="all">All stores</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
       <label className="sr-only" htmlFor="demo-period">Reporting period</label><select id="demo-period" value={period} onChange={e=>setPeriod(e.target.value as 'today'|'7days'|'30days')}><option value="today">Today</option><option value="7days">Week</option><option value="30days">Month</option></select>
       <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-cyan-200">Illustrative metrics · demo</span>
      </div>

      {(screen==='overview'||screen==='finance'||screen==='stores')&&<div className="ch-kpi-grid lg:grid-cols-4">
       <DemoKpi label="Paid order total" value={fmt(totalRevenue*countFactor)} color="#67e8f9" sub="Fictional sample period" icon={CreditCard}/>
       <DemoKpi label="Paid orders" value={String(visibleOrders.length*countFactor)} color="#93c5fd" sub="Sample order records" icon={ShoppingBag}/>
       <DemoKpi label="Order gross profit" value={fmt(margin*countFactor)} color="#6ee7b7" sub="Before illustrative overhead" icon={Wallet}/>
       <DemoKpi label="Stock available" value={String(visibleProducts.reduce((s,p)=>s+p.stock,0))} color="#fcd34d" sub={low.length+' low-stock example items'} icon={Package}/>
      </div>}

      {screen==='overview'&&<div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><Panel title="Business pulse" description="Same command-centre card structure; all values are sample data.">
         <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[{name:'Revenue',value:fmt(totalRevenue)},{name:'Order queue',value:String(pending.length)},{name:'Inventory',value:String(visibleProducts.length)},{name:'Shipment cost',value:fmt(visibleOrders.reduce((s,o)=>s+o.charge,0))}].map(k=><div key={k.name} className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3"><p className="text-xs text-slate-400">{k.name}</p><p className="mt-2 text-lg font-bold text-white">{k.value}</p></div>)}</div>
         <div className="mt-6 flex h-28 items-end gap-2 border-b border-slate-700/60">{[34,58,43,76,53,85,66,91,73,100,81,97].map((h,i)=><div key={i} className="flex-1 rounded-t bg-gradient-to-t from-sky-800 to-cyan-400/80" style={{height:h+'%'}} aria-hidden="true"/>)}</div><p className="mt-2 text-xs text-slate-500">Illustrative business activity · not a live analytics graph</p>
        </Panel></div>
        <Panel title="Security pulse" description="Synthetic operational status"><div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4"><ShieldCheck className="text-emerald-300" size={27}/><div><p className="font-bold text-emerald-300">Demo signals normal</p><p className="text-xs text-slate-400">Not connected to a live security service</p></div></div><button type="button" className={demoButton+' mt-4 w-full'} onClick={()=>navigate('security')}>Explore security radar <ArrowRight size={14}/></button></Panel>
        <Panel title="Live commerce" description="Sample sales & fulfilment stages"><div className="space-y-3">{visibleOrders.slice(0,4).map(o=><div key={o.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 text-xs"><span className="font-mono text-cyan-300">{o.id}</span><span className="text-white">{fmt(o.total+o.charge)}</span><span className="text-slate-400">{statusLabel(o.status)}</span></div>)}</div><button type="button" onClick={()=>navigate('orders')} className={demoButton+' mt-4'}>Open order queue <ArrowRight size={14}/></button></Panel>
        <Panel title="Inventory radar" description="Product availability and example expiry checks">{visibleProducts.map(p=><div key={p.id} className="mb-2 flex justify-between gap-3 text-xs text-slate-300"><span className="truncate">{p.name}</span><span className={p.stock<=8?'text-amber-300':'text-cyan-300'}>{p.stock} units</span></div>)}<button type="button" onClick={()=>navigate('inventory')} className={demoButton+' mt-3'}>View stock</button></Panel>
        <Panel title="NORA insights" description="Example assistant summary generated locally"><p className="text-sm leading-7 text-slate-200">{low.length?low.length+' sample products have low stock.':'Stock is above the sample threshold.'} {pending.length} fictional orders are still in fulfilment.</p><button type="button" onClick={()=>navigate('ai')} className={demoButton+' mt-4'}>Ask NORA (demo)</button></Panel>
      </div>}

      {(screen==='orders'||screen==='packing'||screen==='shipping')&&renderOrders(screen)}
      {(screen==='products'||screen==='inventory')&&renderProducts()}
      {screen==='stores'&&<div className="grid gap-4 sm:grid-cols-2">{stores.map(s=><Panel key={s.id} title={s.name} description="Fictional business · online and in-store"><p className="text-sm text-slate-300">{orders.filter(o=>o.store===s.id).length} sample orders · {products.filter(p=>p.store===s.id).length} products</p><button type="button" className={demoButton+' mt-4'} onClick={()=>{selectStore(s.id);navigate('overview');}}>Open sample store <ArrowRight size={14}/></button></Panel>)}</div>}
      {screen==='customers'&&<Panel title="Customers" description="No real customer information is available in the public demo"><DemoTable headers={['Customer','Store','Order','Activity']} rows={visibleOrders.map(o=>[o.customer,stores.find(s=>s.id===o.store)?.name,o.id,'Example purchase'])}/></Panel>}
      {screen==='suppliers'&&<Panel title="Supplier Management & Purchase Orders" description="Fictional supplier and buying workflow"><DemoTable headers={['Supplier','Reference','Item','Status']} rows={[[ 'Sample Foods Ltd','DEMO-PO-15','Matta Rice · 20 units','Draft'],['Demo Wholesale Co','DEMO-PO-16','Coconut Oil · 12 units','Awaiting review' ]]}/><button type="button" className={demoButton+' mt-4'} onClick={()=>{const p=visibleProducts[0];if(p)receive(p.id);else log('Select a sample store with stock.');}}>Simulate receiving sample goods</button></Panel>}
      {screen==='marketing'&&<div className="grid gap-4 lg:grid-cols-2"><Panel title="Marketing platform integrations" description="Preview only · no external connections"><div className="grid grid-cols-2 gap-2">{['Google Ads','GA4','Meta','WhatsApp','Email','SEO'].map(n=><div key={n} className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 text-sm text-slate-200">{n}<p className="mt-1 text-[10px] text-slate-500">Example platform</p></div>)}</div><p className="mt-3 text-xs text-slate-400">25-platform roadmap; not 25 active connections.</p></Panel><Panel title="AI marketing & SEO" description="Fictional campaign review"><p className="text-sm text-slate-200">Weekend Kerala Grocery Offers · Example audience: returning customers</p><p className="mt-3 text-xs text-slate-400">Status: {campaign?'Simulated active':'Draft'}</p><button type="button" className={demoButton+' mt-4'} onClick={()=>{setCampaign(v=>!v);log('Sample marketing campaign '+(campaign?'returned to draft.':'activated locally. No messages or ads were sent.'));}}>{campaign?'Return to draft':'Activate sample campaign'}</button></Panel></div>}
      {screen==='pricing'&&<Panel title="Pricing management" description="Cost and margin review; no real prices are modified"><DemoTable headers={['Product','Cost','Selling price','Gross margin']} rows={visibleProducts.map(p=>[p.name,fmt(p.cost),fmt(p.price),((p.price-p.cost)/p.price*100).toFixed(1)+'%'])}/></Panel>}
      {screen==='finance'&&<div className="grid gap-4 lg:grid-cols-2"><Panel title="Profit and loss" description="Simplified illustrative figures, not accounting advice"><div className="space-y-3">{[['Paid-order revenue',fmt(totalRevenue)],['Cost of goods',fmt(cogs)],['Order gross profit',fmt(margin)],['Example overhead',fmt(expenses)],['After overhead',fmt(margin-expenses)]].map(([a,b])=><div key={a} className="flex items-center justify-between border-b border-slate-800 pb-2 text-sm text-slate-200"><span>{a}</span><strong className="text-white">{b}</strong></div>)}</div></Panel><Panel title="Balance sheet & banking" description="Example data only · no bank connection"><p className="text-sm text-slate-300">Assets: £1,240 · Liabilities: £310 · Equity: £930</p><p className="mt-4 text-sm text-slate-300">Sample bank entry: Supplier invoice · £42.00 · Awaiting reconciliation.</p><p className="mt-4 text-xs text-slate-400">VAT and reports require actual ledger data and professional review in the real application.</p></Panel></div>}
      {screen==='customer-care'&&<Panel title="Unified customer support inbox" description="WhatsApp / AI-assisted messaging illustration only"><div className="grid gap-4 sm:grid-cols-[180px_1fr]"><div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 text-xs text-slate-200">Sample Customer A<p className="mt-2 text-slate-400">Delivery enquiry · fictional contact</p></div><div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4 text-sm"><p className="rounded-lg bg-slate-800 p-3 text-slate-200">Can you tell me when my order will arrive?</p>{customerReply&&<p className="ml-auto mt-3 max-w-sm rounded-lg bg-cyan-950 p-3 text-cyan-200">Your sample order is being prepared. This reply was not sent to anyone.</p>}<button type="button" className={demoButton+' mt-4'} onClick={()=>{setCustomerReply(true);log('Example AI customer reply drafted locally. No WhatsApp message was sent.');}}>Draft example AI reply</button></div></div></Panel>}
      {screen==='ai'&&<Panel title="NORA · Quick Analysis" description="Local demonstration, not the production AI assistant"><div className="flex items-start gap-4 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-5"><Sparkles size={26} className="shrink-0 text-cyan-300"/><div><p className="font-bold text-white">NORA sample briefing</p><p className="mt-3 text-sm leading-7 text-slate-200">{pending.length} example orders are not yet delivered. {low.length} products are at or below the sample stock threshold. The fictional sales total is {fmt(totalRevenue)}.</p><p className="mt-3 text-xs text-slate-400">No LLM request, private record, or integration is used for this preview.</p></div></div><button type="button" className={demoButton+' mt-4'} onClick={()=>navigate('inventory')}>Review stock recommendations</button></Panel>}
      {screen==='security'&&<Panel title="Security Radar" description="Synthetic incident feed; this preview performs no security scan"><div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4"><ShieldCheck size={27} className="text-emerald-300"/><div><p className="font-bold text-emerald-300">Demo systems: nominal</p><p className="text-xs text-slate-400">No live status is displayed to public visitors.</p></div></div><p className="mt-4 text-xs text-slate-400">Real operational monitoring requires authorised login.</p></Panel>}
      <div role="status" aria-live="polite" className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3 text-sm leading-6 text-cyan-100">{note}</div>
      <Panel title="Activity stream" description="This visitor's simulated actions only"><ul className="space-y-2">{sampleUpdates.map((s,i)=><li key={i} className="border-l-2 border-cyan-300/35 py-1 pl-3 text-xs leading-6 text-slate-300">{s}</li>)}</ul></Panel>
     </div>
    </div>
   </main>
   <nav aria-label="Demo mobile navigation" className="z-30 grid h-16 shrink-0 grid-cols-5 border-t border-slate-800 bg-slate-900/95 pb-safe-bottom lg:hidden">{([{id:'overview',icon:LayoutDashboard,label:'Home'},{id:'orders',icon:ShoppingBag,label:'Sales'},{id:'products',icon:Boxes,label:'Inventory'},{id:'finance',icon:CreditCard,label:'Finance'},{id:'customer-care',icon:MessageCircle,label:'More'}] as const).map(({id,icon:Icon,label})=><button type="button" key={id} onClick={()=>navigate(id)} className={'flex flex-col items-center justify-center gap-1 text-[10px] font-bold '+(screen===id?'text-cyan-300':'text-slate-500')} aria-current={screen===id?'page':undefined}><Icon size={19}/>{label}</button>)}</nav>
  </div>
 </div>;
}

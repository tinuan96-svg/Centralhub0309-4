'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { sections } from '@/lib/navigation/sections';
import { DashboardKpiCards } from '@/app/dashboard/components/DashboardKpiGrid';
import BusinessPulse from '@/app/dashboard/components/BusinessPulse';
import type { DashboardReport } from '@/lib/dashboard/reporting';
import {
  Activity, ArrowRight, BarChart3, Bell, Barcode, Bot, Boxes,
  CheckCircle2, ChevronDown, ClipboardList, CreditCard, FileText,
  LayoutDashboard, LockKeyhole, Megaphone, Menu, MessageCircle,
  Mic, Package, PackageCheck, RefreshCw, Search, ShieldCheck,
  ShoppingBag, Sparkles, Store, Truck, Wallet, X,
} from 'lucide-react';

type Screen = 'module' | 'overview' | 'orders' | 'products' | 'packing' | 'shipping' |
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
/** Match the actual CentralHub sidebar route tree without importing its auth/data code.
 * Every navigation click remains inside /demo and only changes fictional state.
 */
const demoScreenForRoute=(href:string):Screen=>{
 const p=href.split(/[?#]/)[0];
 if(p==='/dashboard')return 'overview';
 if(p==='/stores'||p.startsWith('/settings/master-data/stores')||p==='/inventory/visibility')return 'stores';
 if(p.startsWith('/orders')||p==='/sync-status')return 'orders';
 if(p==='/customers'||p.startsWith('/business-intelligence/customers'))return 'customers';
 if(p==='/inventory-management/purchase-orders'||p.startsWith('/suppliers')||p.startsWith('/procurement')||p==='/backorder-planning')return 'suppliers';
 if(p==='/inventory'||p.startsWith('/inventory/'))return 'products';
 if(p.startsWith('/inventory-management')||p==='/inventory-audit')return 'inventory';
 if(p.startsWith('/picking')||p.startsWith('/packing'))return 'packing';
 if(p.startsWith('/shipping'))return 'shipping';
 if(p.startsWith('/customer-care')||p==='/marketing/whatsapp')return 'customer-care';
 if(p.startsWith('/marketing'))return 'marketing';
 if(p.startsWith('/pricing')||p.includes('price-opportunities'))return 'pricing';
 if(p.startsWith('/finance')||p==='/banking'||p==='/expenses'||p.startsWith('/profit-analysis'))return 'finance';
 if(p.startsWith('/site-health')||p.startsWith('/settings')||p.startsWith('/developer'))return 'security';
 if(p.startsWith('/business-intelligence')||p.startsWith('/analytics')||p==='/competitors')return 'ai';
 return 'module';
};

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
 const [sampleNow]=useState(()=>Date.now());
 const [products,setProducts]=useState<Product[]>(()=>originalProducts.map(p=>({...p})));
 const [orders,setOrders]=useState<Sale[]>(()=>originalOrders.map(o=>({...o})));
 const [expanded,setExpanded]=useState<string[]>(['01-command']);
 const [navSearch,setNavSearch]=useState('');
 const [activeHref,setActiveHref]=useState('/dashboard');
 const [wide,setWide]=useState(false);
 const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
 const [navOpen,setNavOpen]=useState(false);
 useEffect(()=>{
  const update=()=>{const width=window.innerWidth;setWide(width>=700);setSidebarCollapsed(previous=>width>=700&&width<900?true:previous);if(width>=700)setNavOpen(false);};
  update();window.addEventListener('resize',update,{passive:true});return()=>window.removeEventListener('resize',update);
 },[]);
 const [search,setSearch]=useState('');
 const [productId,setProductId]=useState('matta');
 const [qty,setQty]=useState(1);
 const [channel,setChannel]=useState<'Online'|'In-store'>('Online');
 const [campaign,setCampaign]=useState(false);
 const [customerReply,setCustomerReply]=useState(false);
 const [notifications,setNotifications]=useState(false);
 const [sampleUpdates,setSampleUpdates]=useState<string[]>(['Demo workspace opened · fictional data loaded.']);
 const [note,setNote]=useState('Select a module or create a sample sale to explore the connected workflow.');
 const [activeLabel,setActiveLabel]=useState('Dashboard');
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
 const navigate=(target:Screen,label?:string,href?:string)=>{
  const defaults:Record<Screen,{label:string;href:string}>={
   module:{label:'Feature preview',href:'/demo'},overview:{label:'Dashboard',href:'/dashboard'},orders:{label:'Order Queue',href:'/orders'},products:{label:'Product Manager',href:'/inventory'},packing:{label:'Picking & Packing',href:'/packing'},shipping:{label:'Shipment List',href:'/shipping'},stores:{label:'All Stores',href:'/stores'},customers:{label:'Customers',href:'/customers'},suppliers:{label:'Suppliers & Purchase Orders',href:'/suppliers'},marketing:{label:'Marketing Overview',href:'/marketing'},finance:{label:'Finance Overview',href:'/finance'},inventory:{label:'Inventory Dashboard',href:'/inventory-management'},'customer-care':{label:'Support Inbox',href:'/customer-care/inbox'},ai:{label:'NORA AI',href:'/customer-care/ai-assistant'},security:{label:'Security Radar',href:'/site-health'},pricing:{label:'Pricing Overview',href:'/pricing'}
  };
  setScreen(target);setActiveLabel(label||defaults[target].label);setActiveHref(href||defaults[target].href);setNavOpen(false);setSearch('');
 };
 const navigateTo=(href:string,label:string)=>{
  const p=href.split(/[?#]/)[0];
  navigate(demoScreenForRoute(href),label,p);
  const group=sections.find(g=>g.items.some(item=>item.href===href));
  if(group)setExpanded(old=>old.includes(group.key)?old:[...old,group.key]);
 };
 const selectStore=(next:string)=>{setStore(next);const product=products.find(p=>p.stock>0&&(next==='all'||p.store===next));if(product)setProductId(product.id);};
 const createSale=()=>{
  if(!choice||choice.stock<qty||qty<1){log('Insufficient sample stock. Choose another product or receive demo stock.');return;}
  const order:Sale={id:'DEMO-'+String(1001+orders.length),store:choice.store,customer:'Sample Customer '+String(orders.length+1),productId:choice.id,qty,total:Number((choice.price*qty).toFixed(2)),charge:4,status:'confirmed'};
  setOrders(old=>[order,...old]);setProducts(old=>old.map(p=>p.id===choice.id?{...p,stock:p.stock-qty}:p));navigate('orders');
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
 const reset=()=>{setProducts(originalProducts.map(p=>({...p})));setOrders(originalOrders.map(o=>({...o})));setStore('all');setProductId('matta');setQty(1);setPeriod('today');setCampaign(false);setCustomerReply(false);setScreen('overview');setActiveLabel('Dashboard');setActiveHref('/dashboard');setNote('Demo reset to initial fictional records.');setSampleUpdates(['Demo reset · fictional records restored.']);};
 const title=activeLabel;
 const shownOrders=visibleOrders.filter(o=>!search||[o.id,o.customer,o.status].some(v=>v.toLowerCase().includes(search.toLowerCase())));
 const shownProducts=visibleProducts.filter(p=>!search||[p.name,p.sku].some(v=>v.toLowerCase().includes(search.toLowerCase())));
 const demoSummary=useMemo(()=>{
  const productSubtotal=visibleOrders.reduce((sum,o)=>sum+o.total,0);
  const deliveryRevenue=visibleOrders.reduce((sum,o)=>sum+o.charge,0);
  const costs=visibleOrders.reduce((sum,o)=>sum+(products.find(p=>p.id===o.productId)?.cost||0)*o.qty,0);
  const revenue=productSubtotal+deliveryRevenue;
  const profit=revenue-costs;
  return {
   totalRevenue:revenue,productSubtotal,deliveryRevenue,actualGrossProfit:profit,totalOverhead:visibleOrders.length*1.75,
   netProfit:profit-visibleOrders.length*1.75,totalInventoryValue:products.reduce((sum,p)=>sum+p.stock*p.cost,0),totalOrders:visibleOrders.length,
   pendingOrders:pending.length,estimatedCosts:0,missingCosts:0,costRows:[],
  };
 },[visibleOrders,products,pending.length]);
 const sampleReport:DashboardReport={
  current:demoSummary,previous:null,
  orders:visibleOrders.map((o,i)=>({id:o.id,store_id:o.store,total:o.total+o.charge,delivery_fee:o.charge,order_status:o.status,payment_status:'paid',payment_method:'demo',created_at:new Date(sampleNow-(i+1)*45*60000).toISOString(),delivery_city:null,customer_email:null})),
  inventory:products.map(p=>({id:p.id,product_id:p.id,stock_quantity:p.stock,low_stock_threshold:8,cost_price:p.cost})),
  stores:stores.map(s=>({id:s.id,name:s.name,slug:s.id})),
  products:products.map(p=>({id:p.id,name:p.name,revenue:visibleOrders.filter(o=>o.productId===p.id).reduce((sum,o)=>sum+o.total,0),units:visibleOrders.filter(o=>o.productId===p.id).reduce((sum,o)=>sum+o.qty,0)})),
  start:new Date(sampleNow-24*3600000),end:new Date(),loadedAt:new Date(),
 };
 const filteredNav=sections.map(section=>({...section,items:section.items.filter(item=>!navSearch||item.label.toLowerCase().includes(navSearch.toLowerCase())||section.label.toLowerCase().includes(navSearch.toLowerCase()))})).filter(section=>!navSearch||section.items.length);
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
  {!wide && navOpen && <button type="button" aria-label="Close demo navigation" className="fixed inset-0 z-40 bg-black/65" onClick={()=>setNavOpen(false)}/>}
  <aside
   className={'centralhub-sidebar z-50 flex h-[100dvh] shrink-0 flex-col border-r border-slate-800 bg-slate-950 transition-[width,transform] duration-200 '+(wide ? 'relative translate-x-0 '+(sidebarCollapsed?'w-[64px]':'w-[270px]') : 'fixed inset-y-0 left-0 w-[270px] '+(navOpen?'translate-x-0':'-translate-x-full'))}
   aria-label="Demo navigation" aria-modal={!wide&&navOpen?'true':undefined}
  >
   <div className="flex min-h-16 items-center justify-between gap-2 border-b border-slate-800 p-3">
    {wide&&sidebarCollapsed ? <span className="font-black text-white">CH</span> : <strong className="text-white">CentralHub <span className="text-cyan-300">DEMO</span></strong>}
    <button type="button" onClick={()=>wide?setSidebarCollapsed(x=>!x):setNavOpen(false)} aria-label={wide?(sidebarCollapsed?'Expand demo sidebar':'Collapse demo sidebar'):'Close demo menu'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">{!wide?<X size={18}/>:sidebarCollapsed?'→':'←'}</button>
   </div>
   {(!wide||!sidebarCollapsed)&&<><div className="px-4 pt-3"><p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-400">Business navigation</p><p className="mt-1 text-[10px] text-slate-500">Organised by what each area is used for</p></div><div className="p-3"><input value={navSearch} onChange={e=>setNavSearch(e.target.value)} placeholder="Search navigation..." aria-label="Search demo navigation" className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"/></div></>}
   <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4" aria-label="CentralHub modules">
    {filteredNav.map(group=><div key={group.key} className="mb-1">
     <button type="button" title={group.description} onClick={()=>{if(wide&&sidebarCollapsed){setSidebarCollapsed(false);setExpanded(a=>a.includes(group.key)?a:[...a,group.key]);}else setExpanded(a=>a.includes(group.key)?a.filter(key=>key!==group.key):[...a,group.key]);}}
      className={'flex min-h-[44px] w-full items-center justify-between gap-1 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-wider '+(group.items.some(item=>item.href.split(/[?#]/)[0]===activeHref)?'bg-cyan-500/10 text-cyan-300':'text-slate-400 hover:text-white')} aria-expanded={expanded.includes(group.key)}>
      <span className={(wide&&sidebarCollapsed)?'w-full text-center text-xl':'truncate'}>{wide&&sidebarCollapsed?group.icon:<>{group.icon} {group.label}</>}</span>
      {(!wide||!sidebarCollapsed)&&<span aria-hidden="true">{expanded.includes(group.key)?'−':'+'}</span>}
     </button>
     {expanded.includes(group.key)&&(!wide||!sidebarCollapsed)&&<div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">{group.items.map(item=><button
       type="button" key={item.href} onClick={()=>navigateTo(item.href,item.label)}
       aria-current={activeHref===item.href.split(/[?#]/)[0]?'page':undefined}
       className={'block min-h-10 w-full rounded-lg px-3 py-2 text-left text-xs '+(activeHref===item.href.split(/[?#]/)[0]?'bg-slate-800 text-white':'text-slate-400 hover:text-slate-200')}>
       {item.label}
      </button>)}</div>}
    </div>)}
   </nav>
   <div className="border-t border-slate-800 p-3">
    <p className="truncate text-xs font-bold text-white">{wide&&sidebarCollapsed?'DEMO':'Demo visitor'}</p>
    {(!wide||!sidebarCollapsed)&&<><p className="text-[10px] text-slate-500">No account or data access</p><Link href="/login" className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-cyan-200 hover:text-white">Exit demo <ArrowRight size={14}/></Link></>}
   </div>
  </aside>

  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
   <header className="sticky top-0 z-30 flex min-h-[64px] shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#0e1326]/95 px-3 backdrop-blur-xl sm:px-6">
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
     {!wide&&<button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-200" onClick={()=>setNavOpen(true)} aria-label="Open demo navigation"><Menu size={20}/></button>}
     <h2 className="max-w-[11rem] truncate text-sm font-black uppercase tracking-tight text-white sm:text-lg">🤖 {screen==='overview'?'Dashboard':title}</h2>
     <span className="hidden shrink-0 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] font-black text-cyan-200 sm:inline">DEMO MODE</span>
     {wide&&<button type="button" className="hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-400 min-[1000px]:inline-flex" onClick={()=>setSidebarCollapsed(false)}><Search size={15}/> Search navigation…</button>}
    </div>
    <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={()=>setNotifications(x=>!x)} className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300" aria-label="Sample notifications"><Bell size={18}/>{low.length>0&&<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400"/>}</button><Link href="/login" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-cyan-400/30 px-3 text-xs font-bold text-cyan-200 hover:bg-cyan-400/10"><LockKeyhole size={14}/> <span className="hidden sm:inline">Exit demo / Login</span><span className="sm:hidden">Exit</span></Link></div>
   </header>
   {notifications&&<div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-cyan-400/20 bg-slate-900 px-4 py-3 text-xs text-slate-200"><p>Sample alerts: {low.length} low-stock products · {pending.length} active sample orders. No live system is connected.</p><button type="button" onClick={()=>setNotifications(false)} className={demoButton}>Close</button></div>}
   <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2 text-xs text-amber-100"><span><strong>DEMO DATA ONLY</strong> · Shared CentralHub navigation and dashboard components with fictional data. No real orders, payments, courier bookings, messages or database writes.</span><button type="button" onClick={reset} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-400/20 px-3 font-bold hover:bg-amber-400/10"><RefreshCw size={13}/> Reset</button></div>

   <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-20 sm:pb-4">
    <div className="ch-dashboard ch-dashboard-workspace">
     <div className="ch-dashboard-stack">
      {screen!=='overview'&&<div className="ch-dashboard-hero"><div><p className="ch-eyebrow">CentralHub / Sample workspace</p><h1 className="ch-dashboard-title">{title}</h1><p className="ch-muted">Fictional demonstration of the CentralHub business workflow</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={reset} className={demoButton}><RefreshCw size={15}/> Reset demo</button><button type="button" onClick={()=>navigateTo('/orders','Order Queue')} className={demoButton}><ShoppingBag size={15}/> Sample sale</button></div></div>}
      <div className="ch-console-toolbar" aria-label="Demo dashboard filters">
       <label className="sr-only" htmlFor="demo-store">Store</label><select id="demo-store" value={store} onChange={e=>selectStore(e.target.value)}><option value="all">All stores</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
       <label className="sr-only" htmlFor="demo-period">Reporting period</label><select id="demo-period" value={period} onChange={e=>setPeriod(e.target.value as 'today'|'7days'|'30days')}><option value="today">Today</option><option value="7days">Week</option><option value="30days">Month</option></select>
       <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-cyan-200">SAMPLE DATA · NOT LIVE</span>
      </div>
      {screen==='overview'&&<div className="ch-live-status" data-running="false" role="status"><span className="ch-live-orbit"><i/><b/></span><span className="ch-live-label">Demo data<small>Simulated locally · no live events or 30s checks</small></span></div>}

      {(screen==='overview'||screen==='finance'||screen==='stores')&&<div className="ch-visual-comparisons"><DashboardKpiCards current={demoSummary} previous={null} compact comparisonType="none"/></div>}

      {screen==='overview'&&<div className="ch-visual-surface space-y-3">
       <p className="ch-console-scope">{period==='today'?'Today':period==='7days'?'Week':'Month'} · {store==='all'?'All stores':stores.find(x=>x.id===store)?.name} · fixed example order set, not historical reporting</p>
       <section aria-label="Executive overview" className="space-y-3">
        <div className="mb-2 flex items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Executive overview</p><p className="mt-1 text-xs text-slate-500">Sample KPIs, security, core operations and actions that need attention.</p></div></div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/50 p-3 text-xs text-slate-300 sm:grid-cols-4">
          {['Stores · '+stores.length,'Orders · '+visibleOrders.length,'Inventory alerts · '+low.length,'Demo systems · nominal'].map(signal=><span key={signal} className="rounded-lg border border-slate-700/40 p-2">{signal}</span>)}
        </div>
        <div className="grid grid-cols-1 gap-3 fold-inner:grid-cols-2 2xl:grid-cols-3">
         <div className="min-w-0 fold-inner:col-span-2 2xl:col-span-2"><BusinessPulse report={sampleReport} connection="offline" refreshError={false} selectedStoreId={store} demo/></div>
         <Panel title="Security pulse" description="Synthetic status · not the live radar"><div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4"><ShieldCheck className="text-emerald-300" size={27}/><div><p className="font-bold text-emerald-300">Demo signals normal</p><p className="text-xs text-slate-400">Not connected to a security service</p></div></div><button type="button" className={demoButton+' mt-4'} onClick={()=>navigateTo('/site-health','Site Health')}>Explore security radar <ArrowRight size={14}/></button></Panel>
         <Panel title="Live commerce" description="Fictional sales and fulfilment stages"><div className="space-y-3">{visibleOrders.slice(0,4).map(o=><div key={o.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 text-xs"><span className="font-mono text-cyan-300">{o.id}</span><span className="text-white">{fmt(o.total+o.charge)}</span><span className="text-slate-400">{statusLabel(o.status)}</span></div>)}</div><button type="button" onClick={()=>navigateTo('/orders','Order Queue')} className={demoButton+' mt-4'}>Open order queue <ArrowRight size={14}/></button></Panel>
         <Panel title="Inventory radar" description="Sample stock and expiry checks">{visibleProducts.map(p=><div key={p.id} className="mb-2 flex justify-between gap-3 text-xs text-slate-300"><span className="truncate">{p.name}</span><span className={p.stock<=8?'text-amber-300':'text-cyan-300'}>{p.stock} units</span></div>)}<button type="button" onClick={()=>navigateTo('/inventory-management','Inventory Dashboard')} className={demoButton+' mt-3'}>View inventory</button></Panel>
         <Panel title="Sync mesh" description="Illustrative store connections"><p className="text-sm text-slate-200">{stores.length} fictional stores shown · no live store sync</p><div className="mt-4 flex gap-2">{stores.map(x=><span key={x.id} className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-2 py-1 text-xs text-cyan-200">{x.name}</span>)}</div></Panel>
         <Panel title="Growth & attention" description="Example operational actions"><p className="text-sm text-slate-200">{low.length} low-stock products and {pending.length} unfulfilled orders need sample review.</p><button type="button" className={demoButton+' mt-4'} onClick={()=>navigateTo('/inventory','Product Manager')}>Review example stock</button></Panel>
         <Panel title="NORA insights" description="Local sample analysis only"><p className="text-sm leading-7 text-slate-200">{low.length?low.length+' fictional products have low stock.':'Stock is above the sample threshold.'} {pending.length} fictional orders are still in fulfilment.</p><button type="button" onClick={()=>navigateTo('/customer-care/ai-assistant','AI Assistant')} className={demoButton+' mt-4'}>Ask NORA (demo)</button></Panel>
        </div>
       </section>
       <section aria-label="Detailed dashboard modules" className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Detailed modules</p>
        {[
          {label:'Operations & fulfilment',description:'Orders, stock, delivery and customers',target:'/orders',name:'Order Queue'},
          {label:'Finance & profitability',description:'Revenue, profit and banking',target:'/finance',name:'Finance Overview'},
          {label:'Growth & marketing',description:'Campaigns and store performance',target:'/marketing',name:'Marketing Overview'},
          {label:'System & integrations',description:'Monitoring, sample alerts and AI',target:'/site-health',name:'Site Health'},
        ].map(group=><details key={group.label} className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/45"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-200">{group.label}</p><p className="mt-1 text-[10px] text-slate-500">{group.description}</p></div><ChevronDown size={18} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"/></summary><div className="border-t border-slate-800 p-4"><button type="button" className={demoButton} onClick={()=>navigateTo(group.target,group.name)}>Explore sample module <ArrowRight size={14}/></button></div></details>)}
       </section>
      </div>}

      <nav className="ch-workspace-navigation" aria-label="Dashboard views"><div className="ch-tabs">{([
       {id:'overview',label:'Overview',icon:LayoutDashboard,href:'/dashboard'},
       {id:'products',label:'Products',icon:Package,href:'/inventory'},
       {id:'orders',label:'Orders',icon:ShoppingBag,href:'/orders'},
       {id:'packing',label:'Packing',icon:PackageCheck,href:'/packing'},
       {id:'shipping',label:'Shipping',icon:Truck,href:'/shipping'},
      ] as const).map(tab=><button type="button" key={tab.id} className="ch-tab" aria-pressed={screen===tab.id} onClick={()=>navigateTo(tab.href,tab.label)}><tab.icon size={17} aria-hidden="true"/>{tab.label}</button>)}</div><div className="ch-workspace-links">{[['/finance/p-and-l','P&L'],['/finance/transactions','Bank reconciliation'],['/finance/payables','Payables'],['/finance/planning','Planning']].map(([href,label])=><button key={href} type="button" onClick={()=>navigateTo(href,label)} className="text-sm text-cyan-200 hover:underline">{label}</button>)}</div></nav>
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
      {screen==='module'&&<Panel title={title} description="Actual CentralHub navigation · protected feature"><p className="text-sm leading-7 text-slate-300">This specialist screen is not connected to external services in the public demo. Explore the related sample modules using the same navigation, or sign in for the live feature when authorised.</p><button type="button" className={demoButton+' mt-4'} onClick={()=>navigateTo('/dashboard','Dashboard')}>Return to dashboard</button></Panel>}
      {screen==='security'&&<Panel title="Security Radar" description="Synthetic incident feed; this preview performs no security scan"><div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4"><ShieldCheck size={27} className="text-emerald-300"/><div><p className="font-bold text-emerald-300">Demo systems: nominal</p><p className="text-xs text-slate-400">No live status is displayed to public visitors.</p></div></div><p className="mt-4 text-xs text-slate-400">Real operational monitoring requires authorised login.</p></Panel>}
      <div role="status" aria-live="polite" className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3 text-sm leading-6 text-cyan-100">{note}</div>
      <Panel title="Activity stream" description="This visitor's simulated actions only"><ul className="space-y-2">{sampleUpdates.map((s,i)=><li key={i} className="border-l-2 border-cyan-300/35 py-1 pl-3 text-xs leading-6 text-slate-300">{s}</li>)}</ul></Panel>
     </div>
    </div>
   </main>
   {!wide&&<nav aria-label="Demo mobile navigation" className="z-30 grid h-16 shrink-0 grid-cols-5 border-t border-slate-800 bg-slate-900/95 pb-safe-bottom">{([
     {id:'overview',icon:LayoutDashboard,label:'Home',href:'/dashboard'},
     {id:'orders',icon:ShoppingBag,label:'Sales',href:'/orders'},
     {id:'products',icon:Boxes,label:'Inventory',href:'/inventory'},
     {id:'finance',icon:CreditCard,label:'Finance',href:'/finance'},
     {id:'menu',icon:Menu,label:'More',href:'menu'},
    ] as const).map(({id,icon:Icon,label,href})=><button type="button" key={id} onClick={()=>id==='menu'?setNavOpen(true):navigateTo(href,label==='Home'?'Dashboard':label)} className={'flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-tight '+(screen===id?'text-cyan-300':'text-slate-500')} aria-current={screen===id?'page':undefined}><Icon size={19}/>{label}</button>)}</nav>}

  </div>
 </div>;
}

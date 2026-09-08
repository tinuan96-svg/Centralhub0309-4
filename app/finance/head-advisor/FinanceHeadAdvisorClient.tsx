'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Ledger = { id:string; code:string; name:string; ledger_type:string; pnl_class:string; pricing_relevant:boolean; description:string|null };

const rules = [
  { keys:['internet','broadband','wifi','telecom','phone line','connectivity'], name:'Telecoms / internet', code:'6500', ledger_type:'expense', pnl_class:'operating_expense', pricing_relevant:true, treatment:'Prepayment when the service covers future periods; recognise monthly over the benefit period.', rationale:'Business internet or telecoms service used across the operating period.' },
  { keys:['hosting','domain','website','software','saas','subscription'], name:'Software / online services', code:'6100', ledger_type:'expense', pnl_class:'operating_expense', pricing_relevant:true, treatment:'Prepayment when the service covers future periods; recognise monthly over the benefit period.', rationale:'Digital service used by the business.' },
  { keys:['advert','facebook','google ads','marketing'], name:'Marketing / advertising', code:'6200', ledger_type:'expense', pnl_class:'operating_expense', pricing_relevant:true, treatment:'Normal expense as the campaign is delivered.', rationale:'Promotional spend supports customer acquisition.' },
  { keys:['rent','warehouse','storage','premises'], name:'Rent / premises', code:'6000', ledger_type:'expense', pnl_class:'operating_expense', pricing_relevant:true, treatment:'Prepayment if paid before the rental benefit is received.', rationale:'Premises cost follows the rental period.' },
  { keys:['stock','inventory','goods','rice','spices','product'], name:'Inventory asset', code:'1400', ledger_type:'asset', pnl_class:'none', pricing_relevant:false, treatment:'Balance-sheet inventory; move to COGS when sold.', rationale:'Goods held for resale are not an immediate operating expense.' },
  { keys:['shipping','courier','delivery','postage'], name:'Shipping / courier costs', code:'6300', ledger_type:'expense', pnl_class:'variable_expense', pricing_relevant:true, treatment:'Normal expense linked to fulfilment activity.', rationale:'Delivery cost follows the order or shipment.' },
  { keys:['bank fee','payment fee','mollie','stripe','merchant'], name:'Merchant / payment services', code:'6400', ledger_type:'expense', pnl_class:'variable_expense', pricing_relevant:true, treatment:'Normal expense linked to the payment or settlement.', rationale:'Payment processing cost is transaction-related.' },
];

const monthsBetween = (a:string,b:string) => {
  if (!a || !b) return 0;
  const start = new Date(a); const end = new Date(b);
  return Math.max(0,(end.getFullYear()-start.getFullYear())*12+end.getMonth()-start.getMonth()+1);
};

export default function FinanceHeadAdvisorClient() {
  const [ledgers,setLedgers] = useState<Ledger[]>([]);
  const [form,setForm] = useState({ what:'', when:'', purpose:'', benefitStart:'', benefitEnd:'', amount:'', supplier:'' });
  const [suggestion,setSuggestion] = useState<any>(null);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState<string|null>(null);
  const [error,setError] = useState<string|null>(null);

  useEffect(() => { supabase.from('finance_ledger_accounts').select('id,code,name,ledger_type,pnl_class,pricing_relevant,description').eq('is_active',true).order('code').then(({data,error}) => { if(error) setError(error.message); setLedgers((data||[]) as Ledger[]); }); }, []);

  const existingNames = useMemo(() => new Set(ledgers.map(x => x.name.toLowerCase())), [ledgers]);

  const suggest = () => {
    setError(null); setMessage(null);
    const text = (form.what+' '+form.purpose+' '+form.supplier).toLowerCase();
    const durationMatch = text.match(/(\\d+)\\s*(year|years|month|months)/);
    const inferredMonths = durationMatch ? (durationMatch[2].startsWith('year') ? Number(durationMatch[1])*12 : Number(durationMatch[1])) : 0;
    const months = monthsBetween(form.benefitStart,form.benefitEnd) || inferredMonths;
    const rule = rules.find(x => x.keys.some(k => text.includes(k))) || { name:'Other operating expenses', code:'6900', ledger_type:'expense', pnl_class:'operating_expense', pricing_relevant:true, treatment:months>1?'Review as a prepayment and recognise over the benefit period.':'Normal expense.', rationale:'No existing business pattern matched confidently; review before creating a new head.' };
    const existing = ledgers.find(x => x.name.toLowerCase() === rule.name.toLowerCase()) || null;
    setSuggestion({ ...rule, existing, months, monthly: form.amount && months ? Number(form.amount)/months : null });
  };

  const useSuggestion = () => {
    if (!suggestion) return;
    if (suggestion.existing) { setMessage('Use the existing head '+suggestion.existing.code+' · '+suggestion.existing.name+'; creating another duplicate is not recommended.'); return; }
    setForm(x => ({...x, what:x.what, purpose:x.purpose}));
    setMessage('Suggested details are ready to review below. Confirm the name and code before creating it.');
  };

  const create = async () => {
    if (!suggestion || suggestion.existing || !suggestion.name.trim()) return;
    setSaving(true); setError(null); setMessage(null);
    const { error } = await supabase.rpc('create_finance_ledger_account', { p_code:suggestion.code, p_name:suggestion.name, p_ledger_type:suggestion.ledger_type, p_pnl_class:suggestion.pnl_class, p_pricing_relevant:suggestion.pricing_relevant, p_description:suggestion.rationale });
    if (error) setError(error.message); else { setMessage('Head created. It is now available in reconciliation.'); const {data}=await supabase.from('finance_ledger_accounts').select('id,code,name,ledger_type,pnl_class,pricing_relevant,description').eq('is_active',true).order('code'); setLedgers((data||[]) as Ledger[]); }
    setSaving(false);
  };

  return <main className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
    <header><a href="/finance/ledger" className="text-cyan-300 text-xs">← Chart of accounts</a><p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em] mt-4">CentralHub Finance</p><h1 className="text-3xl font-black text-white">Accounting Head Adviser</h1><p className="text-sm text-slate-400 mt-1">Describe what was bought, when, and what business benefit it provides. CentralHub compares existing heads and applies UK accrual/prepayment logic as a review aid. The administrator confirms the final treatment.</p></header>
    {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
    {message&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
      <input value={form.what} onChange={e=>setForm({...form,what:e.target.value})} placeholder="What was purchased? e.g. 2-year website hosting" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"/>
      <input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder="Supplier / merchant" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"/>
      <input type="date" value={form.when} onChange={e=>setForm({...form,when:e.target.value})} title="Payment date" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"/>
      <textarea value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} placeholder="What is it for in the business?" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white min-h-24"/>
      <div className="grid grid-cols-2 gap-3"><input type="date" value={form.benefitStart} onChange={e=>setForm({...form,benefitStart:e.target.value})} title="Benefit starts" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"/><input type="date" value={form.benefitEnd} onChange={e=>setForm({...form,benefitEnd:e.target.value})} title="Benefit ends" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"/></div>
      <input inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="Amount £" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"/>
      <button onClick={suggest} className="w-full bg-cyan-500 text-slate-950 rounded-xl p-3 text-xs font-black uppercase tracking-widest">Suggest head and treatment</button>
    </section>
    {suggestion&&<section className="bg-slate-900 border border-cyan-500/30 rounded-3xl p-5 space-y-2"><p className="text-[10px] uppercase tracking-widest text-cyan-300 font-black">Recommendation</p><h2 className="text-xl font-black text-white">{suggestion.existing?suggestion.existing.code+' · '+suggestion.existing.name:'New head: '+suggestion.code+' · '+suggestion.name}</h2><p className="text-emerald-300 font-bold">{suggestion.treatment}</p><p className="text-slate-400 text-sm">{suggestion.rationale}</p>{suggestion.months>1&&<p className="text-amber-300 text-sm">Benefit period: {suggestion.months} months{suggestion.monthly?' · estimated monthly P&L allocation: £'+suggestion.monthly.toFixed(2):''}</p>}<div className="flex gap-2"><button onClick={useSuggestion} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-black uppercase">{suggestion.existing?'Use existing head':'Review new head'}</button>{!suggestion.existing&&<button disabled={saving} onClick={create} className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black uppercase">{saving?'Creating…':'Create confirmed head'}</button>}</div></section>}
    <p className="text-xs text-slate-500">This is an accounting decision aid, not automatic tax advice. For unusual, material, capital, VAT, or related-party items, confirm with your accountant.</p>
  </main>;
}

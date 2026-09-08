'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Channel = {
  id:string; business_name:string|null; waba_id:string|null; phone_number_id:string|null;
  display_phone_number:string|null; status:string; admin_intake_enabled:boolean;
  authorized_sender_phones:string[]|null; channel_purpose:string;
};
type Item = {
  id:string; created_at:string; sender_phone:string; sender_name:string|null; message_type:string;
  message_text:string|null; media_filename:string|null; media_storage_path:string|null; status:string;
  intake_type:string; route_section:string; target_store_id:string|null; supplier_id:string|null;
  confidence:number|null; extracted_data:any; error_message:string|null; finance_document_id:string|null;
};
type Named = { id:string; name:string };

const routeHref = (route:string) => {
  if (route === 'suppliers_pricing') return '/suppliers/pricing';
  if (route === 'procurement') return '/procurement';
  if (route === 'inventory') return '/inventory-management';
  if (route === 'orders') return '/orders';
  if (route === 'marketing') return '/marketing';
  if (route === 'customer_care') return '/customer-care/inbox';
  if (route === 'vat') return '/finance/vat';
  if (route === 'finance') return '/finance/transactions';
  return '/finance';
};
const badge = (status:string) => {
  if (status === 'ready' || status === 'reviewed') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
  if (status === 'needs_review' || status === 'duplicate') return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
  if (status === 'error' || status === 'rejected') return 'text-rose-300 bg-rose-500/10 border-rose-500/20';
  return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20';
};
const randomToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'CH_ADMIN_' + Array.from(bytes).map(x => x.toString(16).padStart(2,'0')).join('');
};

export default function AdminIntakeClient() {
  const [channel,setChannel] = useState<Channel|null>(null);
  const [items,setItems] = useState<Item[]>([]);
  const [stores,setStores] = useState<Named[]>([]);
  const [suppliers,setSuppliers] = useState<Named[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [busyId,setBusyId] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [selected,setSelected] = useState<Item|null>(null);
  const [form,setForm] = useState({
    businessName:'CentralHub Admin Intake', displayPhone:'', phoneNumberId:'', wabaId:'',
    accessToken:'', verifyToken:'', appSecret:'', authorizedPhones:'', enabled:true,
  });

  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-admin-webhook`;

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes,iRes,sRes,supRes] = await Promise.all([
      supabase.from('whatsapp_channels')
        .select('id,business_name,waba_id,phone_number_id,display_phone_number,status,admin_intake_enabled,authorized_sender_phones,channel_purpose')
        .eq('channel_purpose','admin_intake').maybeSingle(),
      supabase.from('whatsapp_admin_intake_items').select('*').order('created_at',{ascending:false}).limit(150),
      supabase.from('stores').select('id,name').order('name'),
      supabase.from('suppliers').select('id,name').eq('is_active',true).order('name'),
    ]);
    if (cRes.error) setError(cRes.error.message);
    if (iRes.error) setError(iRes.error.message);
    const c = (cRes.data || null) as Channel|null;
    setChannel(c);
    setItems((iRes.data || []) as Item[]);
    setStores((sRes.data || []) as Named[]);
    setSuppliers((supRes.data || []) as Named[]);
    if (c) setForm(x => ({
      ...x,
      businessName:c.business_name || 'CentralHub Admin Intake',
      displayPhone:c.display_phone_number || '',
      phoneNumberId:c.phone_number_id || '',
      wabaId:c.waba_id || '',
      authorizedPhones:(c.authorized_sender_phones || []).join(', '),
      enabled:c.admin_intake_enabled,
      accessToken:'', appSecret:'', verifyToken:'',
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const storeMap = useMemo(() => new Map(stores.map(x => [x.id,x.name])), [stores]);
  const supplierMap = useMemo(() => new Map(suppliers.map(x => [x.id,x.name])), [suppliers]);
  const ready = !!channel && channel.status === 'active' && channel.admin_intake_enabled && !!channel.phone_number_id && (channel.authorized_sender_phones?.length || 0) > 0;

  const saveConfig = async () => {
    setSaving(true); setError(null); setNotice(null);
    try {
      const senders = form.authorizedPhones.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
      if (!senders.length) throw new Error('Add at least one authorised sender phone number.');
      const { data,error } = await supabase.rpc('configure_whatsapp_admin_intake_channel',{
        p_business_name:form.businessName,
        p_waba_id:form.wabaId,
        p_phone_number_id:form.phoneNumberId,
        p_display_phone_number:form.displayPhone,
        p_access_token:form.accessToken,
        p_verify_token:form.verifyToken,
        p_app_secret:form.appSecret,
        p_authorized_sender_phones:senders,
        p_enabled:form.enabled,
      });
      if (error) throw error;
      setNotice(`CentralHub admin channel saved${data ? ` (${String(data).slice(0,8)}…)` : ''}. Secrets are not displayed again.`);
      setForm(x => ({...x,accessToken:'',appSecret:'',verifyToken:''}));
      await load();
    } catch (e:any) { setError(e.message || 'Could not save admin WhatsApp configuration.'); }
    finally { setSaving(false); }
  };

  const generateVerifyToken = () => setForm(x => ({...x,verifyToken:randomToken()}));

  const openOriginal = async (item:Item) => {
    setBusyId(item.id); setError(null);
    try {
      const { data,error } = await supabase.functions.invoke('whatsapp-admin-intake',{body:{action:'signed_url',intake_id:item.id}});
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || 'No original media available.');
      window.open(data.url,'_blank','noopener,noreferrer');
    } catch(e:any) { setError(e.message || 'Could not open original file.'); }
    finally { setBusyId(null); }
  };

  const reprocess = async (item:Item) => {
    setBusyId(item.id); setError(null); setNotice(null);
    try {
      const { data,error } = await supabase.functions.invoke('whatsapp-admin-intake',{body:{action:'reprocess',intake_id:item.id}});
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Reprocessing failed.');
      setNotice('Item reprocessed. No accounting, VAT, stock or pricing change was auto-posted.');
      await load();
    } catch(e:any) { setError(e.message || 'Reprocessing failed.'); }
    finally { setBusyId(null); }
  };

  const markReviewed = async (item:Item) => {
    setBusyId(item.id); setError(null);
    const { error } = await supabase.from('whatsapp_admin_intake_items')
      .update({status:'reviewed',reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq('id',item.id);
    if (error) setError(error.message); else await load();
    setBusyId(null);
  };

  return <main className="min-h-screen bg-slate-950 text-white p-4 sm:p-6">
    <div className="max-w-[1700px] mx-auto space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <Link href="/finance" className="text-xs text-cyan-300">← Finance Command Centre</Link>
          <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[.25em] mt-4">CentralHub Private Intake</p>
          <h1 className="text-3xl font-black">WhatsApp Admin Intake</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-4xl">Send invoices, receipts, bills, payment evidence, supplier price lists and business instructions to CentralHub from an authorised WhatsApp number. Originals are retained; AI extracts and routes; posting remains review-first.</p>
        </div>
        <span className={`px-4 py-2 rounded-xl border text-xs font-black uppercase ${ready ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'}`}>{ready ? 'Ready' : 'Setup required'}</span>
      </header>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}

      <section className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div><h2 className="font-black text-lg">CentralHub number setup</h2><p className="text-xs text-slate-500 mt-1">Use this only for the CentralHub private number. Store/customer numbers keep their existing webhook.</p></div>
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Meta Callback URL</div>
            <div className="mt-1 flex gap-2 items-center"><code className="text-xs text-emerald-300 break-all flex-1">{webhookUrl}</code><button onClick={()=>navigator.clipboard.writeText(webhookUrl)} className="px-3 py-2 rounded-lg bg-slate-800 text-xs">Copy</button></div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <input value={form.businessName} onChange={e=>setForm({...form,businessName:e.target.value})} placeholder="Business name" className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm"/>
            <input value={form.displayPhone} onChange={e=>setForm({...form,displayPhone:e.target.value})} placeholder="CentralHub WhatsApp number e.g. +44..." className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm"/>
            <input value={form.phoneNumberId} onChange={e=>setForm({...form,phoneNumberId:e.target.value})} placeholder="Meta Phone Number ID" className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm"/>
            <input value={form.wabaId} onChange={e=>setForm({...form,wabaId:e.target.value})} placeholder="WABA ID" className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm"/>
            <input type="password" value={form.accessToken} onChange={e=>setForm({...form,accessToken:e.target.value})} placeholder={channel ? 'Access token (leave blank to keep existing)' : 'Permanent access token'} className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm"/>
            <input type="password" value={form.appSecret} onChange={e=>setForm({...form,appSecret:e.target.value})} placeholder={channel ? 'Meta App Secret (leave blank to keep existing)' : 'Meta App Secret'} className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm"/>
            <div className="flex gap-2"><input value={form.verifyToken} onChange={e=>setForm({...form,verifyToken:e.target.value})} placeholder={channel ? 'Verify token (blank keeps existing)' : 'Webhook verify token'} className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm flex-1"/><button onClick={generateVerifyToken} className="px-3 rounded-xl bg-slate-800 text-xs">Generate</button></div>
            <input value={form.authorizedPhones} onChange={e=>setForm({...form,authorizedPhones:e.target.value})} placeholder="Authorised sender phone(s), comma separated" className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm"/>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/> Enable private admin intake</label>
          <div className="flex flex-wrap gap-2">
            <button disabled={saving} onClick={saveConfig} className="px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black uppercase">{saving?'Saving…':channel?'Update configuration':'Create CentralHub channel'}</button>
            {form.verifyToken && <button onClick={()=>navigator.clipboard.writeText(form.verifyToken)} className="px-4 py-2.5 rounded-xl bg-slate-800 text-xs font-black uppercase">Copy verify token</button>}
          </div>
          <p className="text-[11px] text-slate-500">For a new number, paste the callback URL and the same verify token into Meta. Keep the access token and App Secret private. Unknown senders are rejected before document analysis.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <h2 className="font-black">Safety controls</h2>
          {[
            ['Channel isolation','CentralHub uses its own webhook; store customer conversations are untouched.'],
            ['Sender allow-list','Only configured admin phone numbers are accepted.'],
            ['Evidence retained','Original WhatsApp media is stored privately with a content hash.'],
            ['No silent posting','VAT, ledger, stock and supplier price changes stay review-first.'],
            ['Duplicate protection','Repeated files are linked instead of creating duplicate finance records.'],
          ].map(([a,b])=><div key={a} className="rounded-xl bg-slate-950/50 border border-slate-800 p-3"><div className="text-xs font-black text-slate-200">{a}</div><div className="text-[11px] text-slate-500 mt-1">{b}</div></div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between"><div><h2 className="font-black">Intake queue</h2><p className="text-xs text-slate-500 mt-1">Newest WhatsApp admin evidence and instructions.</p></div><button onClick={load} className="px-3 py-2 rounded-lg bg-slate-800 text-xs">Refresh</button></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="text-left px-4 py-3">Received</th><th className="text-left px-4 py-3">Item</th><th className="text-left px-4 py-3">Route</th><th className="text-left px-4 py-3">Store / Supplier</th><th className="text-left px-4 py-3">Confidence</th><th className="text-left px-4 py-3">Status</th><th className="text-right px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">
              {items.map(item => {
                const summary = item.extracted_data?.summary || item.message_text || item.media_filename || item.intake_type;
                return <tr key={item.id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(item.created_at).toLocaleString('en-GB')}</td>
                  <td className="px-4 py-3"><button onClick={()=>setSelected(item)} className="text-left"><div className="text-slate-200 font-semibold max-w-[330px] truncate">{summary}</div><div className="text-[10px] text-slate-500">{item.media_filename || item.message_type} · {item.intake_type}</div></button></td>
                  <td className="px-4 py-3"><Link href={routeHref(item.route_section)} className="text-cyan-300 text-xs">{item.route_section.replaceAll('_',' ')}</Link></td>
                  <td className="px-4 py-3 text-xs text-slate-400">{item.target_store_id ? storeMap.get(item.target_store_id)||'Unknown store' : 'Unassigned'}{item.supplier_id ? ` · ${supplierMap.get(item.supplier_id)||'Supplier'}` : ''}</td>
                  <td className="px-4 py-3 text-slate-300">{item.confidence == null ? '—' : `${Math.round(item.confidence*100)}%`}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg border text-[10px] font-black uppercase ${badge(item.status)}`}>{item.status.replaceAll('_',' ')}</span></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2">
                    {item.media_storage_path && <button disabled={busyId===item.id} onClick={()=>openOriginal(item)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-[10px] font-black uppercase">Original</button>}
                    <button disabled={busyId===item.id} onClick={()=>reprocess(item)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-[10px] font-black uppercase">Reprocess</button>
                    {!['reviewed','rejected'].includes(item.status) && <button disabled={busyId===item.id} onClick={()=>markReviewed(item)} className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 text-[10px] font-black uppercase">Reviewed</button>}
                  </div></td>
                </tr>
              })}
              {!loading && items.length===0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-600">No CentralHub WhatsApp admin items yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selected && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={()=>setSelected(null)}>
        <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5" onClick={e=>e.stopPropagation()}>
          <div className="flex justify-between gap-4"><div><h3 className="font-black text-xl">Intake details</h3><p className="text-xs text-slate-500">{selected.id}</p></div><button onClick={()=>setSelected(null)} className="text-2xl text-slate-500">×</button></div>
          <div className="grid sm:grid-cols-2 gap-3 mt-5 text-xs">
            <Info label="Type" value={selected.intake_type}/><Info label="Route" value={selected.route_section}/><Info label="Store" value={selected.target_store_id ? storeMap.get(selected.target_store_id)||selected.target_store_id : 'Unassigned'}/><Info label="Supplier" value={selected.supplier_id ? supplierMap.get(selected.supplier_id)||selected.supplier_id : 'Unassigned'}/>
          </div>
          <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-4"><div className="text-[10px] uppercase text-slate-500 font-black">Extraction</div><pre className="mt-2 text-[11px] text-slate-300 whitespace-pre-wrap break-words">{JSON.stringify(selected.extracted_data,null,2)}</pre></div>
          {selected.error_message && <div className="mt-3 text-xs text-amber-300">{selected.error_message}</div>}
        </div>
      </div>}
    </div>
  </main>;
}
function Info({label,value}:{label:string;value:string}) { return <div className="rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div><div className="mt-1 text-slate-200">{value}</div></div>; }

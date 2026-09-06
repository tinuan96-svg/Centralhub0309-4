'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StoreBusinessIdentity } from '@/lib/types';

const EMPTY: Omit<StoreBusinessIdentity, 'id' | 'store_id' | 'created_at' | 'updated_at'> = {
  legal_company_name: '', trading_name: '', company_registration_number: '', vat_number: '',
  legal_address: '', city: '', postcode: '', country: 'United Kingdom', business_email: '',
  business_phone: '', website_domain: '', verification_status: 'not_verified', verification_notes: ''
};

type Props = { storeId: string; compact?: boolean };

export default function BusinessIdentityPanel({ storeId, compact = false }: Props) {
  const [identity, setIdentity] = useState<any>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setMessage(null);
      const { data, error } = await supabase.from('store_business_identities').select('*').eq('store_id', storeId).maybeSingle();
      if (!active) return;
      if (error) setMessage(error.message);
      setIdentity(data ? { ...EMPTY, ...data } : { ...EMPTY });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [storeId]);

  const update = (key: string, value: string) => setIdentity((prev: any) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true); setMessage(null);
    const { error } = await supabase.from('store_business_identities').upsert({ store_id: storeId, ...identity, updated_at: new Date().toISOString() }, { onConflict: 'store_id' });
    setSaving(false);
    setMessage(error ? error.message : 'Business identity saved.');
  };

  if (loading) return <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500">Loading business identity…</div>;

  const fields = [
    ['legal_company_name', 'Legal company name'], ['trading_name', 'Trading name'],
    ['company_registration_number', 'Company registration number'], ['vat_number', 'VAT number'],
    ['legal_address', 'Legal address'], ['city', 'City'], ['postcode', 'Postcode'],
    ['country', 'Country'], ['business_email', 'Business email'], ['business_phone', 'Business phone'],
    ['website_domain', 'Website domain']
  ];

  return <section className={`rounded-2xl border border-slate-800 bg-slate-900/40 ${compact ? 'p-4' : 'p-6'}`}>
    <div className="flex items-start justify-between gap-4 mb-5">
      <div><h3 className="text-base font-black text-white">Business Identity</h3><p className="text-xs text-slate-500 mt-1">This identifies the selected company for its own external platform connections.</p></div>
      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">{String(identity.verification_status).replace('_',' ')}</span>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map(([key,label]) => <label key={key} className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</span><input value={identity[key] || ''} onChange={e => update(key, e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" /></label>)}
    </div>
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Verification status</span><select value={identity.verification_status} onChange={e => update('verification_status', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"><option value="not_verified">Not verified</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="needs_review">Needs review</option></select></label>
      <label className="block"><span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Verification notes</span><input value={identity.verification_notes || ''} onChange={e => update('verification_notes', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" /></label>
    </div>
    {message && <div className={`mt-4 rounded-xl px-3 py-2 text-xs ${message === 'Business identity saved.' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>{message}</div>}
    <div className="mt-5 flex justify-end"><button type="button" onClick={save} disabled={saving} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">{saving ? 'Saving…' : 'Save Business Identity'}</button></div>
  </section>;
}

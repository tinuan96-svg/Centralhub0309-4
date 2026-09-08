'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type VerificationStatus = 'not_verified' | 'pending' | 'verified' | 'needs_review';

type MarketingProfile = {
  brand_name: string;
  logo_url: string;
  currency: string;
  timezone: string;
  primary_language: string;
  marketing_sender_name: string;
  facebook_page_name: string;
  instagram_handle: string;
  meta_business_name: string;
  google_ads_account_name: string;
  merchant_center_name: string;
  google_business_profile_name: string;
  youtube_channel_name: string;
};

type IdentityForm = {
  legal_company_name: string;
  trading_name: string;
  company_registration_number: string;
  vat_number: string;
  legal_address: string;
  city: string;
  postcode: string;
  country: string;
  business_email: string;
  business_phone: string;
  website_domain: string;
  verification_status: VerificationStatus;
  notes: string;
  marketing: MarketingProfile;
};

const EMPTY_MARKETING: MarketingProfile = {
  brand_name: '',
  logo_url: '',
  currency: 'GBP',
  timezone: 'Europe/London',
  primary_language: 'en-GB',
  marketing_sender_name: '',
  facebook_page_name: '',
  instagram_handle: '',
  meta_business_name: '',
  google_ads_account_name: '',
  merchant_center_name: '',
  google_business_profile_name: '',
  youtube_channel_name: '',
};

const EMPTY: IdentityForm = {
  legal_company_name: '',
  trading_name: '',
  company_registration_number: '',
  vat_number: '',
  legal_address: '',
  city: '',
  postcode: '',
  country: 'GB',
  business_email: '',
  business_phone: '',
  website_domain: '',
  verification_status: 'not_verified',
  notes: '',
  marketing: EMPTY_MARKETING,
};

type Props = { storeId: string; compact?: boolean };

export default function BusinessIdentityPanel({ storeId, compact = false }: Props) {
  const [identity, setIdentity] = useState<IdentityForm>(EMPTY);
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setMessage(null);
      setIsError(false);
      const { data, error } = await supabase
        .from('store_business_identity')
        .select('legal_company_name,trading_name,company_registration_number,vat_number,legal_address,city,postcode,country,business_email,business_phone,website_domain,verification_status,notes,metadata')
        .eq('store_id', storeId)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setMessage(error.message);
        setIsError(true);
      }

      const rawMetadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {};
      const rawMarketing = rawMetadata.marketing_profile && typeof rawMetadata.marketing_profile === 'object'
        ? rawMetadata.marketing_profile as Partial<MarketingProfile>
        : {};

      setMetadata(rawMetadata);
      setIdentity(data ? {
        ...EMPTY,
        ...data,
        notes: data.notes || '',
        marketing: { ...EMPTY_MARKETING, ...rawMarketing },
      } as IdentityForm : { ...EMPTY, marketing: { ...EMPTY_MARKETING } });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [storeId]);

  const update = (key: Exclude<keyof IdentityForm, 'marketing'>, value: string) => {
    setIdentity(prev => ({ ...prev, [key]: value }));
  };

  const updateMarketing = (key: keyof MarketingProfile, value: string) => {
    setIdentity(prev => ({ ...prev, marketing: { ...prev.marketing, [key]: value } }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setIsError(false);

    const marketingProfile = Object.fromEntries(
      Object.entries(identity.marketing).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );

    const payload = {
      store_id: storeId,
      legal_company_name: identity.legal_company_name.trim() || null,
      trading_name: identity.trading_name.trim() || null,
      company_registration_number: identity.company_registration_number.trim() || null,
      vat_number: identity.vat_number.trim() || null,
      legal_address: identity.legal_address.trim() || null,
      city: identity.city.trim() || null,
      postcode: identity.postcode.trim() || null,
      country: identity.country.trim() || 'GB',
      business_email: identity.business_email.trim() || null,
      business_phone: identity.business_phone.trim() || null,
      website_domain: identity.website_domain.trim() || null,
      verification_status: identity.verification_status,
      notes: identity.notes.trim() || null,
      metadata: {
        ...metadata,
        marketing_profile: marketingProfile,
      },
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('store_business_identity')
      .upsert(payload, { onConflict: 'store_id' });

    setSaving(false);
    setIsError(Boolean(error));
    setMessage(error ? error.message : 'Business and marketing identity saved.');
    if (!error) setMetadata(payload.metadata);
  };

  if (loading) {
    return <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500">Loading business identity…</div>;
  }

  const businessFields: Array<[Exclude<keyof IdentityForm, 'marketing' | 'verification_status' | 'notes'>, string, string?]> = [
    ['legal_company_name', 'Legal company name'],
    ['trading_name', 'Trading name'],
    ['company_registration_number', 'Company registration number'],
    ['vat_number', 'VAT number'],
    ['legal_address', 'Legal address'],
    ['city', 'City'],
    ['postcode', 'Postcode'],
    ['country', 'Country code', 'GB'],
    ['business_email', 'Business email'],
    ['business_phone', 'Business phone'],
    ['website_domain', 'Website domain', 'example.com'],
  ];

  const marketingFields: Array<[keyof MarketingProfile, string, string?]> = [
    ['brand_name', 'Brand name'],
    ['logo_url', 'Store logo URL', 'https://...'],
    ['currency', 'Default currency', 'GBP'],
    ['timezone', 'Timezone', 'Europe/London'],
    ['primary_language', 'Primary language', 'en-GB'],
    ['marketing_sender_name', 'Marketing sender/display name'],
    ['facebook_page_name', 'Facebook Page name'],
    ['instagram_handle', 'Instagram handle', '@...'],
    ['meta_business_name', 'Meta Business name'],
    ['google_ads_account_name', 'Google Ads expected account name'],
    ['merchant_center_name', 'Merchant Center expected account name'],
    ['google_business_profile_name', 'Google Business Profile name'],
    ['youtube_channel_name', 'YouTube channel name'],
  ];

  return <section className={`rounded-2xl border border-slate-800 bg-slate-900/40 ${compact ? 'p-4' : 'p-6'}`}>
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h3 className="text-base font-black text-white">Business & Marketing Identity</h3>
        <p className="text-xs text-slate-500 mt-1">Store-scoped identity used to match and configure external platforms. OAuth connections remain separate and never receive credentials from these fields.</p>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
        {String(identity.verification_status).replace('_', ' ')}
      </span>
    </div>

    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 mb-5 text-xs text-slate-300">
      Core store IDs, slugs, stock masking, order sync and product sync are not changed here. Marketing values are stored inside the existing business-identity metadata so they cannot alter operational store behaviour.
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {businessFields.map(([key, label, placeholder]) => <label key={key} className="block">
        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</span>
        <input
          value={String(identity[key] || '')}
          placeholder={placeholder}
          onChange={e => update(key, e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
        />
      </label>)}
    </div>

    <div className="mt-6 pt-6 border-t border-slate-800">
      <div className="mb-4">
        <h4 className="text-sm font-black text-white">Marketing Profile</h4>
        <p className="text-xs text-slate-500 mt-1">Used for account discovery, matching, reporting labels and campaign defaults. These values do not grant access to Meta, Google or any other platform.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {marketingFields.map(([key, label, placeholder]) => <label key={key} className="block">
          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</span>
          <input
            value={identity.marketing[key] || ''}
            placeholder={placeholder}
            onChange={e => updateMarketing(key, e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
          />
        </label>)}
      </div>
    </div>

    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="block">
        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Verification status</span>
        <select
          value={identity.verification_status}
          onChange={e => update('verification_status', e.target.value as VerificationStatus)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
        >
          <option value="not_verified">Not verified</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="needs_review">Needs review</option>
        </select>
      </label>
      <label className="block">
        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Verification notes</span>
        <input
          value={identity.notes}
          onChange={e => update('notes', e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
        />
      </label>
    </div>

    {message && <div className={`mt-4 rounded-xl px-3 py-2 text-xs ${isError ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'}`}>
      {message}
    </div>}

    <div className="mt-5 flex justify-end">
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Business & Marketing Identity'}
      </button>
    </div>
  </section>;
}

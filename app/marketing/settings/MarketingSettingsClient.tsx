'use client';

import { useEffect, useState } from 'react';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { marketingService } from '@/lib/services/marketing/marketingService';

type ProviderSetup = {
  configured: boolean;
  client_id_hint?: string | null;
  redirect_uri?: string | null;
  app_label?: string | null;
  developer_token_stored?: boolean;
  login_customer_id?: string | null;
  ads_api_ready?: boolean;
  status?: string;
};

export default function MarketingSettings({ params, searchParams }: { params: any; searchParams: any }) {
  const [providerId,setProviderId]=useState<'meta'|'google'>('meta');
  const [setup,setSetup]=useState<ProviderSetup|null>(null);
  const [requiredRedirect,setRequiredRedirect]=useState('');
  const [clientId,setClientId]=useState(''),[clientSecret,setClientSecret]=useState(''),[developerToken,setDeveloperToken]=useState(''),[loginCustomerId,setLoginCustomerId]=useState(''),[appLabel,setAppLabel]=useState('');
  const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);

  const loadProvider=async(id:'meta'|'google')=>{setLoading(true);setError(null);setNotice(null);try{const result=await marketingService.getPlatformOAuthConfig(id);setSetup(result.config||null);setRequiredRedirect(result.required_redirect_uri||result.config?.redirect_uri||'');setClientId('');setClientSecret('');setDeveloperToken('');setLoginCustomerId(result.config?.login_customer_id||'');setAppLabel(result.config?.app_label||'');}catch(err:any){setSetup(null);setError(err?.message||'Could not load platform setup.')}finally{setLoading(false)}};
  useEffect(()=>{loadProvider(providerId)},[providerId]);

  const saveProvider=async()=>{setSaving(true);setError(null);setNotice(null);try{if(!clientId.trim()&&!setup?.configured)throw new Error(providerId==='google'?'Google OAuth Client ID is required.':'Meta App ID is required.');if(!clientSecret.trim()&&!setup?.configured)throw new Error(providerId==='google'?'Google OAuth Client Secret is required.':'Meta App Secret is required.');const result=await marketingService.configurePlatformOAuth({providerId,clientId:clientId.trim(),clientSecret:clientSecret.trim(),developerToken:providerId==='google'?(developerToken.trim()||undefined):undefined,loginCustomerId:providerId==='google'?(loginCustomerId.trim()||undefined):undefined,appLabel:appLabel.trim()||undefined});setSetup(result.config||null);setRequiredRedirect(result.required_redirect_uri||requiredRedirect);setClientId('');setClientSecret('');setDeveloperToken('');setNotice(`CentralHub ${providerId==='google'?'Google':'Meta'} login configured. ${result.stores_prepared??0} store connection profiles prepared safely.`);}catch(err:any){setError(err?.message||'Could not save platform setup.')}finally{setSaving(false)}};

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Marketing Settings" subtitle="Configure tracking, attribution, and the one-time CentralHub platform connections used by every store." />
      <div className="max-w-4xl space-y-6">
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
            <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Super Admin · Platform Setup</p><h3 className="text-lg font-bold text-white mt-1">One-time managed OAuth apps</h3><p className="text-sm text-slate-400 mt-2 max-w-2xl">Configure CentralHub's developer app once. After this, each store only sees <strong className="text-white">Connect Meta</strong> or <strong className="text-white">Connect Google</strong> and is sent to the official login screen. Secrets are never shown again.</p></div>
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1"><button onClick={()=>setProviderId('meta')} className={`px-4 py-2 rounded-lg text-xs font-black ${providerId==='meta'?'bg-blue-600 text-white':'text-slate-500'}`}>Meta</button><button onClick={()=>setProviderId('google')} className={`px-4 py-2 rounded-lg text-xs font-black ${providerId==='google'?'bg-blue-600 text-white':'text-slate-500'}`}>Google</button></div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 mb-5"><div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-widest text-slate-300">Status</span><span className={`text-[10px] font-black uppercase ${setup?.configured?'text-emerald-300':'text-amber-300'}`}>{loading?'Checking…':setup?.configured?'Configured':'Setup required'}</span></div>{setup?.client_id_hint&&<p className="text-xs text-slate-500 mt-2">App: {setup.client_id_hint}</p>}{setup?.configured&&providerId==='google'&&<p className="text-xs text-slate-500 mt-1">Google Ads developer token: {setup.developer_token_stored?'stored':'not configured'}</p>}</div>
          <div className="space-y-4">
            <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Required redirect URI</label><div className="flex gap-2"><input readOnly value={requiredRedirect} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-300"/><Button variant="secondary" onClick={()=>navigator.clipboard?.writeText(requiredRedirect)}>Copy</Button></div><p className="text-[10px] text-slate-600 mt-2">Register this exact URI in the provider developer console.</p></div>
            <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">{providerId==='google'?'Google OAuth Client ID':'Meta App ID'} {setup?.configured&&<span className="text-slate-700">— leave blank to keep current</span>}</label><input value={clientId} onChange={e=>setClientId(e.target.value)} autoComplete="off" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white"/></div>
            <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">{providerId==='google'?'Google OAuth Client Secret':'Meta App Secret'} {setup?.configured&&<span className="text-slate-700">— leave blank to keep current</span>}</label><input type="password" value={clientSecret} onChange={e=>setClientSecret(e.target.value)} autoComplete="new-password" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white"/></div>
            {providerId==='google'&&<><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Google Ads Developer Token {setup?.developer_token_stored&&<span className="text-slate-700">— leave blank to keep current</span>}</label><input type="password" value={developerToken} onChange={e=>setDeveloperToken(e.target.value)} autoComplete="new-password" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white"/></div><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Google Ads Manager Customer ID (optional)</label><input value={loginCustomerId} onChange={e=>setLoginCustomerId(e.target.value)} placeholder="123-456-7890" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white"/></div></>}
            <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Internal app label (optional)</label><input value={appLabel} onChange={e=>setAppLabel(e.target.value)} placeholder={providerId==='google'?'CentralHub Google':'CentralHub Meta'} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white"/></div>
            {error&&<div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}{notice&&<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">{notice}</div>}
            <Button onClick={saveProvider} disabled={saving||loading}>{saving?'Saving securely…':setup?.configured?'Update managed login':'Configure managed login'}</Button>
          </div>
        </Card>

        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <h3 className="text-lg font-bold text-white mb-4">Attribution Configuration</h3>
          <div className="space-y-4"><div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Default Attribution Model</label><select className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"><option value="last_click">Last Click (Default)</option><option value="first_click">First Click</option><option value="linear">Linear Distribution</option></select></div><div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Conversion Window (Days)</label><input type="number" defaultValue={30} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" /></div></div>
        </Card>

        <Card className="p-6 bg-slate-900/50 border-slate-800"><h3 className="text-lg font-bold text-white mb-4">UTM Parameters</h3><p className="text-sm text-slate-400 mb-6">CentralHub automatically generates UTM links for campaigns using these defaults.</p><div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Default Source</label><input type="text" defaultValue="centralhub" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" /></div><div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Default Medium</label><input type="text" defaultValue="internal" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" /></div></div></Card>
      </div>
    </div>
  );
}

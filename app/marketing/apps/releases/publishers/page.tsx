'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type LinkedApp = { id:string; name?:string; platform:string; identifier:string; external_app_id?:string|null; status:string; store?:{name?:string;slug?:string}|null }
type PublisherAccount = { id:string; provider_id:'google_play'|'app_store_connect'; display_name:string; account_scope:string; status:string; public_config:Record<string,any>; stored_secrets:string[]; last_test_at?:string|null; last_test_status?:string|null; last_test_error?:string|null; linked_apps:LinkedApp[] }

const label = (id:string) => id === 'google_play' ? 'Google Play' : 'App Store Connect'

export default function SharedPublisherAccountsPage(){
  const [accounts,setAccounts]=useState<PublisherAccount[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [googleJson,setGoogleJson]=useState('')
  const [issuerId,setIssuerId]=useState('')
  const [keyId,setKeyId]=useState('')
  const [privateKey,setPrivateKey]=useState('')

  const load=async()=>{
    setLoading(true);setError('')
    const {data,error:invokeError}=await supabase.functions.invoke('app-publisher-account-config',{body:{action:'overview'}})
    if(invokeError||data?.error){setError(data?.error||invokeError?.message||'Unable to load publisher accounts');setLoading(false);return}
    const next=(data?.accounts||[]) as PublisherAccount[]
    setAccounts(next)
    const apple=next.find(a=>a.provider_id==='app_store_connect')
    setIssuerId(String(apple?.public_config?.issuer_id||''));setKeyId(String(apple?.public_config?.key_id||''))
    setLoading(false)
  }
  useEffect(()=>{void load()},[])

  const save=async(providerId:'google_play'|'app_store_connect')=>{
    setBusy(`save:${providerId}`);setError('');setMessage('')
    const values=providerId==='google_play'?{service_account_json:googleJson}:{issuer_id:issuerId,key_id:keyId,private_key:privateKey}
    const {data,error:invokeError}=await supabase.functions.invoke('app-publisher-account-config',{body:{action:'save',providerId,values}})
    if(invokeError||data?.error)setError(data?.error||invokeError?.message||'Save failed')
    else {setMessage(`${label(providerId)} shared publisher credential saved.`);setGoogleJson('');setPrivateKey('');await load()}
    setBusy('')
  }
  const test=async(providerId:'google_play'|'app_store_connect')=>{
    setBusy(`test:${providerId}`);setError('');setMessage('')
    const {data,error:invokeError}=await supabase.functions.invoke('app-publisher-account-config',{body:{action:'test',providerId}})
    if(invokeError||data?.error)setError(data?.error||invokeError?.message||'Connection test failed')
    else {setMessage(data?.result?.detail||`${label(providerId)} connection passed.`);await load()}
    setBusy('')
  }

  if(loading)return <div className="min-h-screen bg-slate-950 p-6 text-slate-300">Loading shared publisher accounts…</div>

  const google=accounts.find(a=>a.provider_id==='google_play')
  const apple=accounts.find(a=>a.provider_id==='app_store_connect')
  const card=(account:PublisherAccount|undefined)=>account&&<div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Shared business publisher</p><h2 className="mt-1 text-xl font-black">{account.display_name}</h2><p className="mt-1 text-xs text-slate-500">One credential serves every linked business app. App signing keys remain separate.</p></div>
      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${account.last_test_status==='passed'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-300':account.last_test_status==='failed'?'border-rose-500/30 bg-rose-500/10 text-rose-300':'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>{account.last_test_status==='passed'?'Verified':account.last_test_status==='failed'?'Test failed':'Needs test'}</span>
    </div>
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Linked business apps</p><div className="mt-2 flex flex-wrap gap-2">{account.linked_apps.map(app=><span key={app.id} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300">{app.name||app.identifier} · {app.identifier}</span>)}</div></div>
    {account.provider_id==='google_play'?<div className="mt-4"><label className="text-xs font-bold text-slate-300">Google Play service-account JSON</label><textarea value={googleJson} onChange={e=>setGoogleJson(e.target.value)} rows={7} placeholder={account.stored_secrets.includes('service_account_json')?'Credential already stored — paste only to replace it':'Paste the service-account JSON here'} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 outline-none focus:border-cyan-500"/><p className="mt-2 text-[11px] text-slate-500">This is the Play publishing service account, not google-services.json. It is encrypted server-side.</p></div>:<div className="mt-4 grid gap-3"><input value={issuerId} onChange={e=>setIssuerId(e.target.value)} placeholder="Issuer ID" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200"/><input value={keyId} onChange={e=>setKeyId(e.target.value)} placeholder="Key ID" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200"/><textarea value={privateKey} onChange={e=>setPrivateKey(e.target.value)} rows={6} placeholder={account.stored_secrets.includes('private_key')?'Private key already stored — paste only to replace it':'Paste .p8 private-key contents'} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200"/></div>}
    {account.last_test_error&&<div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200">{account.last_test_error}</div>}
    <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void save(account.provider_id)} disabled={!!busy} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40">{busy===`save:${account.provider_id}`?'Saving…':'Save credential'}</button><button onClick={()=>void test(account.provider_id)} disabled={!!busy||account.status!=='configured'} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-black text-emerald-300 disabled:opacity-40">{busy===`test:${account.provider_id}`?'Testing…':'Test connection'}</button></div>
  </div>

  return <div className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">App operations</p><h1 className="mt-1 text-2xl font-black">Shared Publisher Accounts</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Configure Google Play and App Store Connect once for all business apps. CentralHub personal publishing is intentionally excluded.</p></div><Link href="/marketing/apps/releases" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-black text-slate-200">Back to Release Manager</Link></div>
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-100"><strong>Isolation rule:</strong> this business publisher account is for MalluSpices, KeralaGrocery, PocketGrocery, TamilRetail, Nivo and future business apps. The CentralHub app stays on your separate personal publisher account.</div>
    {error&&<div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}{message&&<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{message}</div>}
    {card(google)}{card(apple)}
  </div></div>
}

'use client';

import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/**
 * Identity proof ONLY. Auth is validated by Supabase's getUser() endpoint.
 * No staff role, password, profile, store, activation, or business row changes.
 */
export default function StaffTestVerifyPage(){
  const [email,setEmail]=useState('');
  const [signedInEmail,setSignedInEmail]=useState('');
  const [provider,setProvider]=useState('');
  const [verified,setVerified]=useState(false);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    const check=async()=>{
      const {data,error:authError}=await supabase.auth.getUser();
      if(!mounted)return;
      if(authError||!data.user){setSignedInEmail('');setProvider('');setVerified(false);setBusy(false);return;}
      setSignedInEmail(data.user.email||'');
      setProvider(String(data.user.app_metadata?.provider||''));
      setVerified(Boolean(data.user.email_confirmed_at));
      setBusy(false);
    };
    void check();
    return()=>{mounted=false};
  },[]);
  const startGoogle=async()=>{
    // Never replace a signed-in Super Admin session in the normal browser.
    if(signedInEmail){setError('Open this page in a separate private/incognito window before signing in with the test Google account.');return;}
    setBusy(true);setError('');
    const {error:authError}=await supabase.auth.signInWithOAuth({
      provider:'google',
      options:{redirectTo:`${window.location.origin}/staff-test-verify`,queryParams:{prompt:'select_account'}}
    });
    if(authError){setBusy(false);setError('Google verification could not start. Confirm the OAuth redirect URL is allowlisted.');}
  };
  const matches=signedInEmail.length>0&&email.trim().toLowerCase()===signedInEmail.toLowerCase()&&verified&&provider==='google';
  return <main className="min-h-[100dvh] bg-slate-950 p-4 text-slate-100 sm:p-8">
    <div className="mx-auto max-w-xl space-y-5 rounded-2xl border border-cyan-700/50 bg-slate-900 p-5 shadow-xl sm:p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">CentralHub / Issue #4</p>
      <h1 className="text-2xl font-bold">Verify ownership of the existing test login</h1>
      <p className="text-sm text-slate-300">Use a private/incognito browser window so your normal Super Admin session stays signed in. This page verifies an existing Google account only: it never converts an account, changes passwords or enables staff access.</p>
      {busy?<p role="status">Checking identity…</p>:signedInEmail?
        <div className="space-y-3 rounded-xl border border-slate-600 p-4">
          <p className="text-sm text-slate-300">Supabase Auth returned this signed-in account:</p>
          <p className="break-all font-semibold text-white">{signedInEmail}</p>
          <p className="text-xs text-slate-300">Google provider: {provider==='google'?'confirmed':'not confirmed'} · Email verified: {verified?'yes':'no'}</p>
          <label className="block text-sm text-slate-200">Enter the exact test email you previously approved
            <input type="email" autoComplete="off" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-500 bg-slate-950 px-3 py-3 text-white" placeholder="Your existing test email"/>
          </label>
          {matches?<p role="status" className="rounded-lg border border-emerald-600 bg-emerald-950/50 p-3 text-sm text-emerald-200">Identity check passed for this browser session. Your account has NOT been converted to staff. Return to your ChatGPT conversation and tell me the identity check passed; do not share any token or password.</p>:
            <p className="text-sm text-amber-200">The signed-in identity must match the approved email and be a verified Google account. If it does not, close this private window and do not continue.</p>}
          <button type="button" className="rounded-lg border border-slate-500 px-4 py-2 text-sm" onClick={()=>void supabase.auth.signOut().then(()=>{setSignedInEmail('');setProvider('');setVerified(false);setEmail('');})}>Sign out of this private test session</button>
        </div>:
        <button type="button" onClick={()=>void startGoogle()} disabled={busy}
          className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">Verify with the existing Google account</button>}
      {error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}
      <p className="text-xs text-slate-400">No staff profile, role, password, store assignment or production records are created or changed here. General staff creation and activation remain disabled.</p>
    </div>
  </main>;
}

'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export default function StaffPendingAccess({user,session,signOut}:{
  user:User; session:Session|null; signOut:()=>Promise<void>;
}) {
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const needsChange=user.app_metadata?.must_change_password===true;
  async function changePassword(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if(!needsChange || !session?.access_token) {setError('Please sign in again.');return;}
    if(password!==confirmation) {setError('Passwords do not match.');return;}
    if(password.length<14 || password.length>128) {setError('Choose a password of 14–128 characters.');return;}
    setSaving(true);
    try {
      const response=await fetch('/api/staff/first-login',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({password})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Could not change your password.');
      setPassword('');setConfirmation('');
      // Discard the temporary credential's session. Await explicit Super Admin
      // activation; changing the password grants no CentralHub access.
      const {error:signOutError}=await supabase.auth.signOut({scope:'global'});
      if(signOutError)throw new Error('Password changed. Please sign out and log in again.');
      window.location.replace('/login');
    } catch(err) {setError(err instanceof Error?err.message:'Password setup failed.');}
    finally {setSaving(false);}
  }
  return <section className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-4 text-slate-100">
    <div className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-8">
      <p className="text-sm font-bold uppercase tracking-wider text-cyan-300">CentralHub · Staff login</p>
      <h1 className="text-2xl font-bold text-white">{needsChange?'Change your temporary password':'Staff access is pending'}</h1>
      <p className="break-all text-sm text-slate-300">{user.email}</p>
      {needsChange ? <form onSubmit={changePassword} className="space-y-4">
        <p className="text-sm text-slate-200">Your Super Admin created this login. Set a private password now. Changing it will not automatically activate your account.</p>
        <label className="block text-sm text-slate-200">New password
          <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white"
            type="password" autoComplete="new-password" minLength={14} maxLength={128}
            required value={password} onChange={event=>setPassword(event.target.value)}/>
        </label>
        <label className="block text-sm text-slate-200">Confirm new password
          <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white"
            type="password" autoComplete="new-password" required value={confirmation}
            onChange={event=>setConfirmation(event.target.value)}/>
        </label>
        {error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}
        <button className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-40"
          disabled={saving||password.length<14||password!==confirmation}>{saving?'Saving…':'Set new password'}</button>
      </form> : <p className="text-sm text-slate-300">Your login has been set up. The Super Admin must separately activate your account and assigned sections. No business data is available while access is pending.</p>}
      <button onClick={()=>void signOut()} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-white">Sign out</button>
    </div>
  </section>;
}

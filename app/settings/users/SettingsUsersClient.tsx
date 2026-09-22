'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { STAFF_ROLES, STAFF_ROLE_PRESETS, STAFF_SECTIONS, SUPER_ADMIN_ONLY_PERMISSION_KEYS, type StaffRole } from '@/lib/access-control/catalog';
import { userService, type UserProfile } from '@/lib/services/userService';

type StaffRecord = {
  user_id: string; email: string; full_name: string; role_key: StaffRole;
  status: 'pending'|'active'|'suspended'; all_stores: boolean;
  store_ids: string[]; permissions: string[];
};
type Store = {id:string; name:string; slug:string};
type Directory = {
  staff: StaffRecord[];
  administrators: Array<{id:string; email:string; full_name:string; is_active:boolean}>;
  stores:Store[]; creationEnabled:boolean; activationEnabled:boolean;
  activationMode:'manual'; accountCreationMode:'manual';
};
type Editor = {
  user_id?:string; email:string; full_name:string; role_key:StaffRole;
  status:'pending'|'active'|'suspended'; all_stores:boolean;
  store_ids:string[]; permissions:string[];
};
const emptyEditor = (): Editor => ({email:'',full_name:'',role_key:'custom',status:'pending',all_stores:false,store_ids:[],permissions:[]});
const inputClass='w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-white placeholder:text-slate-500 outline-none focus:border-cyan-400';
const buttonClass='rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';

export default function SettingsUsersClient({params,searchParams}:{params:any;searchParams:any}) {
  void params; void searchParams;
  const {user} = useAuth();
  const isSuperAdmin = user?.app_metadata?.role === 'admin';
  const [directory,setDirectory] = useState<Directory|null>(null);
  const [oldProfiles,setOldProfiles] = useState<UserProfile[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [editing,setEditing] = useState<Editor|null>(null);
  const [saving,setSaving] = useState(false);
  const [oneTimeCredentials,setOneTimeCredentials] = useState<{email:string; password:string}|null>(null);
  const [credentialsCopied,setCredentialsCopied] = useState(false);
  const load = useCallback(async()=>{
    if(!isSuperAdmin){setLoading(false);return;}
    setLoading(true);setError('');
    try {
      const {data:{session}} = await supabase.auth.getSession();
      if(!session?.access_token) throw new Error('Please sign in again.');
      const response=await fetch('/api/admin/staff',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || 'Cannot load staff directory');
      setDirectory(result as Directory);
    } catch(err) {
      setError(err instanceof Error?err.message:'Staff directory unavailable');
      // Preserve visibility of legacy user management while the migration is pending.
      setOldProfiles(await userService.getAllProfiles());
    } finally {setLoading(false);}
  },[isSuperAdmin]);
  useEffect(()=>{void load();},[load]);

  const send=async()=>{
    if(!editing || !directory)return;
    setSaving(true);setError('');setNotice('');
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token) throw new Error('Please sign in again');
      const response=await fetch('/api/admin/staff',{
        method:editing.user_id?'PATCH':'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify(editing)
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not save permissions');
      if(!editing.user_id){
        if(typeof result.temporary_password !== 'string' || !result.password_change_required)
          throw new Error('Account creation response did not contain one-time credentials; contact administrator.');
        setOneTimeCredentials({email:editing.email,password:result.temporary_password});
        setCredentialsCopied(false);
      }
      setEditing(null);setNotice(editing.user_id?'Staff permissions saved':'Login created. Give the temporary password privately to the staff member. Activate separately after review.');
      await load();
    }catch(err){setError(err instanceof Error?err.message:'Unable to save staff account');}
    finally{setSaving(false);}
  };
  const edit=(staff:StaffRecord)=>setEditing({
    user_id:staff.user_id,email:staff.email,full_name:staff.full_name,
    role_key:staff.role_key,status:staff.status,all_stores:staff.all_stores,
    store_ids:[...staff.store_ids],permissions:[...staff.permissions]
  });
  const changeRole=(role:StaffRole)=>{
    setEditing(prev=>prev?{...prev,role_key:role,permissions:[...STAFF_ROLE_PRESETS[role]]}:prev);
  };
  const togglePermission=(permission:string)=>{
    setEditing(prev=>prev?{...prev,permissions:prev.permissions.includes(permission)
      ?prev.permissions.filter(p=>p!==permission):[...prev.permissions,permission]}:prev);
  };
  const toggleStore=(storeId:string)=>{
    setEditing(prev=>prev?{...prev,store_ids:prev.store_ids.includes(storeId)
      ?prev.store_ids.filter(id=>id!==storeId):[...prev.store_ids,storeId]}:prev);
  };

  if(!isSuperAdmin)return <section className="p-6 text-slate-100"><h1 className="text-xl font-bold">Users & Permissions</h1><p className="mt-3 text-amber-300">Only the verified Super Admin may manage staff access.</p></section>;
  return <section className="mx-auto max-w-7xl space-y-5 p-4 text-slate-100 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black text-white">Users & Permissions</h1>
      <p className="mt-1 text-sm text-slate-300">Assign individual section actions and store access to each staff login.</p></div>
      <button className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
        disabled={!directory?.creationEnabled} onClick={()=>setEditing(emptyEditor())}>+ Create staff login</button>
    </div>
    {!directory?.creationEnabled&&<div className="rounded-xl border border-amber-600/50 bg-amber-950/40 p-4 text-sm text-amber-100">
      Staff login creation remains disabled until database, API and cross-store access security tests pass.
      Existing Super Admin logins remain unchanged.
    </div>}
    {notice&&<p role="status" className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-3 text-emerald-200">{notice}</p>}
    {error&&<p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/40 p-3 text-rose-200">{error}</p>}
    {loading?<p className="p-8 text-center text-slate-300">Loading users…</p>:<>
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-bold text-white">Existing Administrators</h2>
        {(directory?.administrators || oldProfiles.filter(p=>p.profile_role==='admin').map(p=>({id:p.id,email:p.email,full_name:p.full_name,is_active:p.is_active}))).map(p=>
          <div key={p.id} className="flex flex-wrap justify-between gap-3 border-t border-slate-700 py-3 text-sm">
            <div><p className="font-semibold text-white">{p.full_name||'Administrator'}</p><p className="break-all text-slate-300">{p.email}</p></div>
            <span className="text-amber-300">{p.is_active?'Administrator · Active':'Administrator · Disabled'}</span>
          </div>)}
        <p className="mt-2 text-xs text-slate-400">Existing administrator identities are protected from staff-role editing.</p>
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-bold text-white">Staff accounts</h2>
        {!directory?.staff?.length?<p className="text-sm text-slate-300">No staff accounts are configured.</p>:
          <div className="space-y-2">{directory.staff.map(staff=>
            <div key={staff.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 p-3">
              <div className="min-w-0"><p className="font-semibold text-white">{staff.full_name}</p><p className="break-all text-sm text-slate-300">{staff.email}</p>
              <p className="text-xs text-slate-400">{STAFF_ROLES.find(r=>r.key===staff.role_key)?.label||staff.role_key} · {staff.status} · {staff.all_stores?'All stores':`${staff.store_ids.length} assigned stores`}</p></div>
              <button className={buttonClass} onClick={()=>edit(staff)}>Edit access</button>
            </div>)}</div>}
      </div>
    </>}
    {oneTimeCredentials&&<div className="fixed inset-0 z-[140] overflow-y-auto bg-black/90 p-4">
      <div className="mx-auto my-8 max-w-lg space-y-4 rounded-2xl border border-cyan-600 bg-slate-950 p-5 text-slate-100">
        <h2 className="text-xl font-bold text-white">Login created — temporary password</h2>
        <p className="text-sm text-amber-200">Shown only once. Share privately with the staff member. Never put this password in email or a shared chat. They must change it on first sign-in, and you must activate the account separately.</p>
        <p className="break-all rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white">Login: {oneTimeCredentials.email}</p>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <p className="text-xs font-bold text-slate-300">Temporary password</p>
          <p className="mt-2 break-all font-mono text-sm text-white">{oneTimeCredentials.password}</p>
        </div>
        <button className={buttonClass} onClick={async()=>{
          try{await navigator.clipboard.writeText(oneTimeCredentials.password);setCredentialsCopied(true);}
          catch{setError('Clipboard unavailable. Copy the temporary password manually.');}
        }}>{credentialsCopied?'Copied':'Copy temporary password'}</button>
        <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-bold text-slate-950"
          onClick={()=>{setOneTimeCredentials(null);setCredentialsCopied(false);}}>I have saved it securely — close</button>
      </div>
    </div>}
    {editing&&directory&&<div className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 p-3 md:p-8">
      <div className="mx-auto my-3 max-w-4xl space-y-5 rounded-2xl border border-slate-600 bg-slate-950 p-4 shadow-2xl md:p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-white">{editing.user_id?'Edit staff access':'Create staff login manually'}</h2>
          <button className={buttonClass} onClick={()=>setEditing(null)} disabled={saving}>Close</button></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-200">Full name<input className={inputClass+' mt-2'} value={editing.full_name}
            disabled={!!editing.user_id} maxLength={120} onChange={e=>setEditing({...editing,full_name:e.target.value})}/></label>
          <label className="text-sm text-slate-200">Work email<input className={inputClass+' mt-2'} type="email" value={editing.email}
            disabled={!!editing.user_id} onChange={e=>setEditing({...editing,email:e.target.value})}/></label>
          <label className="text-sm text-slate-200">Staff role
            <select className={inputClass+' mt-2'} value={editing.role_key} onChange={e=>changeRole(e.target.value as StaffRole)}>
              {STAFF_ROLES.map(role=><option key={role.key} value={role.key}>{role.label}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-200">Account status
            <select className={inputClass+' mt-2'} value={editing.status}
              disabled={!editing.user_id} onChange={e=>setEditing({...editing,status:e.target.value as Editor['status']})}>
              <option value="pending">Pending</option><option value="suspended">Suspended</option>
              <option value="active" disabled={!directory.activationEnabled}>Active (after security verification)</option>
            </select>
          </label>
        </div>
        <div className="rounded-xl border border-slate-700 p-4">
          <h3 className="font-bold text-white">Permitted stores</h3>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.all_stores}
            onChange={e=>setEditing({...editing,all_stores:e.target.checked,store_ids:e.target.checked?[]:editing.store_ids})}/>All Stores</label>
          {!editing.all_stores&&<div className="mt-3 grid gap-2 sm:grid-cols-2">{directory.stores.map(store=>
            <label key={store.id} className="flex items-center gap-2 rounded-lg border border-slate-700 p-2 text-sm text-slate-100">
              <input type="checkbox" checked={editing.store_ids.includes(store.id)} onChange={()=>toggleStore(store.id)}/>{store.name}
            </label>)}</div>}
        </div>
        <div className="rounded-xl border border-slate-700 p-4">
          <h3 className="text-lg font-bold text-white">Section & feature permissions</h3>
          <p className="mb-4 text-sm text-slate-300">Each action is independent. Refunds, approvals, deletion and export are not implied by Edit.</p>
          <div className="space-y-3">{STAFF_SECTIONS.map(section=>
            <div key={section.key} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <p className="mb-3 font-semibold text-white">{section.label}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{section.actions.map(action=>{
                const permission=`${section.key}.${action}`;
                return <label key={permission} className="flex items-center gap-2 text-sm capitalize text-slate-200">
                  <input type="checkbox" checked={editing.permissions.includes(permission)} disabled={SUPER_ADMIN_ONLY_PERMISSION_KEYS.has(permission)} onChange={()=>togglePermission(permission)}/>{action}{SUPER_ADMIN_ONLY_PERMISSION_KEYS.has(permission)?' (Super Admin only)':''}
                </label>;
              })}</div>
            </div>)}</div>
        </div>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-700 bg-slate-950 py-3">
          <button className={buttonClass} disabled={saving} onClick={()=>setEditing(null)}>Cancel</button>
          <button className="rounded-xl bg-cyan-500 px-5 py-2.5 font-bold text-slate-950 disabled:opacity-40"
            disabled={saving||(!editing.all_stores&&!editing.store_ids.length)||(!editing.user_id&&!directory.creationEnabled)}
            onClick={()=>void send()}>{saving?'Saving…':editing.user_id?'Save permissions':'Create pending login'}</button>
        </div>
      </div>
    </div>}
  </section>;
}

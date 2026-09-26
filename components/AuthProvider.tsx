'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthService } from '@/lib/services/authService';
import { PushNotificationService } from '@/lib/services/pushNotificationService';
import { supabase } from '@/lib/supabase';
import StaffPendingAccess from '@/components/StaffPendingAccess';
import StaffWorkspace from '@/components/StaffWorkspace';
import type { StaffAccessSnapshot } from '@/lib/access-control/routes';
import type { User, Session } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/demoMode';

interface AuthContextType {
  user:User|null; session:Session|null; isLoading:boolean; isAdmin:boolean;
  isStaff:boolean; staffAccess:StaffAccessSnapshot|null; permissions:string[];
  disabledNavKeys:string[]; signOut:()=>Promise<void>;
}
const AuthContext=createContext<AuthContextType>({user:null,session:null,isLoading:true,isAdmin:false,isStaff:false,staffAccess:null,permissions:[],disabledNavKeys:[],signOut:async()=>{}});
export const useAuth=()=>useContext(AuthContext);

export default function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<User|null>(null);
  const [session,setSession]=useState<Session|null>(null);
  const [isLoading,setIsLoading]=useState(true);
  const [staffLoading,setStaffLoading]=useState(false);
  const [adminLoading,setAdminLoading]=useState(false);
  const [verifiedAdminSessionToken,setVerifiedAdminSessionToken]=useState<string|null>(null);
  const [staffAccess,setStaffAccess]=useState<StaffAccessSnapshot|null>(null);
  const [isMounted,setIsMounted]=useState(false);
  const [disabledNavKeys,setDisabledNavKeys]=useState<string[]>([]);
  const router=useRouter(); const pathname=usePathname();
  useEffect(()=>{setIsMounted(true)},[]);

  useEffect(()=>{
    if(!isMounted)return; let mounted=true;
    const applySession=(s:Session|null)=>{if(!mounted)return;setSession(s);setUser(s?.user??null)};
    const initAuth=async()=>{
      try{
        let current=(await supabase.auth.getSession()).data.session;
        if(current?.refresh_token){
          try{const refreshed=await supabase.auth.refreshSession(); if(refreshed.data.session) current=refreshed.data.session;}
          catch(refreshErr){console.warn('AuthProvider: session refresh failed:',refreshErr)}
        }
        applySession(current);
        if(current?.user)return;
        const isAtLogin=pathname==='/'||pathname==='/login'||pathname==='/login/'||pathname==='/staff-test-verify';
        if(!isAtLogin){router.replace('/login');const timeout=setTimeout(()=>{if(window.location.pathname!=='/login'&&window.location.pathname!=='/login/'&&window.location.pathname!=='/staff-test-verify')window.location.replace('/login')},2000);return()=>clearTimeout(timeout)}
      }catch(error){console.error('AuthProvider: Initialization error:',error);const isAtLogin=pathname==='/'||pathname==='/login'||pathname==='/login/'||pathname==='/staff-test-verify';if(mounted&&!isAtLogin)window.location.replace('/login')}
      finally{if(mounted)setIsLoading(false)}
    };
    initAuth();
    const {data:authListener}=AuthService.onAuthStateChange(async(event,nextSession)=>{
      if(!mounted)return;
      if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED'){
        let s=nextSession;
        if(!s){try{s=(await supabase.auth.getSession()).data.session}catch{}}
        applySession(s);
      }else applySession(nextSession);
      if(event==='SIGNED_OUT'){setDisabledNavKeys([]);setStaffAccess(null);window.location.replace('/login')}
      else if(event==='SIGNED_IN'){const isAtLogin=pathname==='/login'||pathname==='/login/';if(isAtLogin)router.replace('/dashboard')}
    });
    return()=>{mounted=false;authListener?.subscription?.unsubscribe()};
  },[pathname,router,isMounted]);

  const isStaff=user?.app_metadata?.role==='staff';
  useEffect(()=>{
    let cancelled=false;
    if(!isStaff||!session?.access_token){setStaffAccess(null);setStaffLoading(false);return;}
    setStaffAccess(null);
    setStaffLoading(true);
    const verify=async()=>{
      try{
        const response=await fetch('/api/staff/access',{
          headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'
        });
        const body=await response.json();
        if(!response.ok)throw new Error(body.error||'Staff access unavailable');
        if(!cancelled)setStaffAccess(body as StaffAccessSnapshot);
      }catch{if(!cancelled)setStaffAccess(null);}
      finally{if(!cancelled)setStaffLoading(false);}
    };
    void verify();
    // Revocation is enforced immediately by every server request; periodically
    // recheck the UI as well so suspended staff do not see stale cached rows.
    const poll=window.setInterval(()=>{void verify();},30000);
    const onFocus=()=>{void verify();};
    window.addEventListener('focus',onFocus);
    return()=>{cancelled=true;window.clearInterval(poll);window.removeEventListener('focus',onFocus);};
  },[isStaff,session?.access_token,user?.id]);

  const adminClaim=user?.app_metadata?.role==='admin';
  useEffect(()=>{
    let cancelled=false;
    if(!adminClaim||!session?.access_token){
      setVerifiedAdminSessionToken(null);
      setAdminLoading(false);
      return;
    }
    const token=session.access_token;
    setVerifiedAdminSessionToken(null);
    setAdminLoading(true);
    const verify=async()=>{
      try{
        const response=await fetch('/api/auth/admin-session',{
          headers:{Authorization:`Bearer ${token}`},cache:'no-store'
        });
        if(!response.ok)throw new Error('Super Admin verification failed');
        if(!cancelled)setVerifiedAdminSessionToken(token);
      }catch{if(!cancelled)setVerifiedAdminSessionToken(null);}
      finally{if(!cancelled)setAdminLoading(false);}
    };
    void verify();
    const poll=window.setInterval(()=>{void verify();},30000);
    const onFocus=()=>{void verify();};
    window.addEventListener('focus',onFocus);
    return()=>{cancelled=true;window.clearInterval(poll);window.removeEventListener('focus',onFocus);};
  },[adminClaim,session?.access_token,user?.id]);

  useEffect(() => {
    if (!session?.user || session.user.app_metadata?.role !== 'admin' || verifiedAdminSessionToken!==session.access_token) return;
    if (isDemoMode()) return;
    PushNotificationService.registerNativeDevice().catch((error) => {
      console.warn('CentralHub native push registration deferred:', error?.message || error);
    });
  }, [session?.user?.id,session?.access_token,verifiedAdminSessionToken]);

  const handleSignOut=async()=>{await AuthService.signOut();router.replace('/login')};
  const isAdmin=adminClaim&&verifiedAdminSessionToken===session?.access_token;
  const isPublicLanding=pathname==='/';
  const isProofPage=pathname==='/staff-test-verify';
  const isAtLogin=pathname==='/login'||pathname==='/login/'||isProofPage;
  const permissions=staffAccess?.active?staffAccess.permissions:[];
  const staffNeedsSetup=isStaff&&(!staffAccess?.active||staffAccess.must_change_password);
  // Staff never mount the existing admin dashboard, sidebar, settings or
  // data-fetching components. Only the isolated, server-scoped workspace is allowed.
  const staffPathAllowed=pathname==='/dashboard'||pathname==='/dashboard/';
  const staffRouteDenied=isStaff&&!!staffAccess?.active&&!isAtLogin&&!staffPathAllowed;
  const loading=isLoading||(isStaff&&staffLoading)||(adminClaim&&adminLoading);

  const value={user,session,isLoading:loading,isAdmin,isStaff,staffAccess,permissions,disabledNavKeys,signOut:handleSignOut};
  return <AuthContext.Provider value={value}>{
    !isMounted?(isPublicLanding?children:<div className="min-h-screen bg-slate-950" aria-busy="true" />):
    isPublicLanding?children:
    isProofPage?children:
    loading?<div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white space-y-4"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div><div className="text-center"><p className="text-lg font-bold">CentralHub</p><p className="text-slate-400 text-sm">Securing your session...</p></div></div>:
    (!user&&!isAtLogin?<div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400 space-y-4"><p>Redirecting to login...</p><button onClick={()=>window.location.href='/login'} className="text-blue-500 hover:underline text-sm">Click here if not redirected</button></div>:
    staffNeedsSetup&&user?<StaffPendingAccess user={user} session={session} signOut={handleSignOut}/>:
    staffRouteDenied?<div className="min-h-screen bg-slate-950 p-8 text-slate-100"><h1 className="text-xl font-bold">Access not assigned</h1><p className="mt-3 text-slate-300">Staff cannot open the administration pages. Use your assigned workspace.</p><button onClick={()=>router.replace('/dashboard')} className="mt-5 rounded-xl bg-cyan-500 px-4 py-2 font-bold text-slate-950">Back to workspace</button></div>:
    isStaff&&session?<StaffWorkspace key={`${user?.id}:${permissions.slice().sort().join(',')}:${staffAccess?.store_ids.slice().sort().join(',')}:${staffAccess?.all_stores}`} session={session} signOut={handleSignOut}/>:
    user&&!isAdmin?<div className="min-h-screen bg-slate-950 p-8 text-slate-100"><h1 className="text-xl font-bold">CentralHub access not authorised</h1><p className="mt-3 text-slate-300">This login is not an active, verified Super Admin or an assigned staff account.</p><button className="mt-5 rounded-xl border border-slate-600 px-4 py-2 text-white" onClick={()=>void handleSignOut()}>Sign out</button></div>:
    children)
  }</AuthContext.Provider>;
}

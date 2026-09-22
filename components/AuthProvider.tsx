'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthService } from '@/lib/services/authService';
import { PushNotificationService } from '@/lib/services/pushNotificationService';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType { user: User | null; session: Session | null; isLoading: boolean; isAdmin: boolean; disabledNavKeys: string[]; signOut: () => Promise<void>; }
const AuthContext=createContext<AuthContextType>({user:null,session:null,isLoading:true,isAdmin:false,disabledNavKeys:[],signOut:async()=>{}});
export const useAuth=()=>useContext(AuthContext);

export default function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<User|null>(null); const [session,setSession]=useState<Session|null>(null); const [isLoading,setIsLoading]=useState(true); const [isMounted,setIsMounted]=useState(false); const [disabledNavKeys,setDisabledNavKeys]=useState<string[]>([]); const router=useRouter(); const pathname=usePathname();
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
        const isAtLogin=pathname==='/login'||pathname==='/login/';
        if(!isAtLogin){router.replace('/login');const timeout=setTimeout(()=>{if(window.location.pathname!=='/login'&&window.location.pathname!=='/login/')window.location.replace('/login')},2000);return()=>clearTimeout(timeout)}
      }catch(error){console.error('AuthProvider: Initialization error:',error);const isAtLogin=pathname==='/login'||pathname==='/login/';if(mounted&&!isAtLogin)window.location.replace('/login')}
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
      if(event==='SIGNED_OUT'){setDisabledNavKeys([]);window.location.replace('/login')}
      else if(event==='SIGNED_IN'){const isAtLogin=pathname==='/login'||pathname==='/login/';if(isAtLogin)router.replace('/dashboard')}
    });
    return()=>{mounted=false;authListener?.subscription?.unsubscribe()};
  },[pathname,router,isMounted]);

  useEffect(() => {
    if (!session?.user) return;
    PushNotificationService.registerNativeDevice().catch((error) => {
      console.warn('CentralHub native push registration deferred:', error?.message || error);
    });
  }, [session?.user?.id]);

  const handleSignOut=async()=>{await AuthService.signOut();router.replace('/login')};
  // UX gate only. Staff must also be denied at every database/API boundary.
  // Never set this flag until the complete issue #4 backend audit passes.
  const staffPending=user?.app_metadata?.role==='staff' && process.env.NEXT_PUBLIC_CENTRALHUB_STAFF_UI_VERIFIED!=='true';
  const isAdmin=(user?.app_metadata as any)?.role==='admin'; const isAtLogin=pathname==='/login'||pathname==='/login/';
  return <AuthContext.Provider value={{user,session,isLoading,isAdmin,disabledNavKeys,signOut:handleSignOut}}>{!isMounted?<div suppressHydrationWarning>{children}</div>:isLoading?<div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white space-y-4"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div><div className="text-center"><p className="text-lg font-bold">CentralHub</p><p className="text-slate-400 text-sm">Securing your session...</p></div></div>:( !user&&!isAtLogin?<div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400 space-y-4"><p>Redirecting to login...</p><button onClick={()=>window.location.href='/login'} className="text-blue-500 hover:underline text-sm">Click here if not redirected</button></div>:staffPending?<div className="min-h-screen bg-slate-950 p-8 text-slate-100"><h1 className="text-xl font-bold">Staff access pending</h1><p className="mt-3 text-slate-300">This account cannot access CentralHub until the Super Admin completes security verification and activates its permitted sections.</p><button className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-white" onClick={()=>void handleSignOut()}>Sign out</button></div>:children)}</AuthContext.Provider>
}

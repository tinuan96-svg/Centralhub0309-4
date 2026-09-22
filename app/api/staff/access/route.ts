import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const dynamic='force-dynamic'; export const runtime='nodejs';
const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
  const bearer=request.headers.get('authorization');
  if(!bearer?.startsWith('Bearer '))return fail('Sign in required',401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret=process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!secret)return fail('Service unavailable',503);
  const publicClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await publicClient.auth.getUser(bearer.slice(7));
  if(error||!user||user.app_metadata?.role!=='staff')return fail('Staff session required',403);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const [account,profile,permissions,stores]=await Promise.all([
    admin.from('ch_staff_accounts').select('role_key,status,all_stores').eq('user_id',user.id).maybeSingle(),
    admin.from('user_profiles').select('is_active').eq('id',user.id).maybeSingle(),
    admin.from('ch_staff_permission_overrides').select('permission_key,allowed').eq('user_id',user.id),
    admin.from('ch_staff_store_access').select('store_id').eq('user_id',user.id),
  ]);
  if(account.error||profile.error||permissions.error||stores.error||!account.data||!profile.data)
    return fail('Staff access record unavailable',403);
  const active=account.data.status==='active'&&profile.data.is_active===true&&user.app_metadata?.must_change_password===false;
  return NextResponse.json({
    active,status:account.data.status,role_key:account.data.role_key,
    must_change_password:user.app_metadata?.must_change_password===true,
    all_stores:account.data.all_stores===true,
    store_ids:(stores.data||[]).map((row:any)=>row.store_id),
    permissions:active?(permissions.data||[]).filter((row:any)=>row.allowed).map((row:any)=>row.permission_key):[]
  },{headers:{'Cache-Control':'no-store, private','Vary':'Authorization'}});
}

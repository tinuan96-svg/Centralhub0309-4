import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isStaffAssignablePermission } from '@/lib/access-control/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fail = (error:string,status:number) =>
  NextResponse.json({error},{status,headers:{'Cache-Control':'no-store, private'}});

/** Live, trusted access snapshot. This is only for workspace presentation:
 * every business API and database/RPC action must check permissions again.
 */
export async function GET(request:Request){
  const bearer=request.headers.get('authorization');
  if(!bearer?.startsWith('Bearer '))return fail('Sign in required',401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret=process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!secret)return fail('Service unavailable',503);

  const publicClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await publicClient.auth.getUser(bearer.slice(7));
  if(error||!user||user.app_metadata?.role!=='staff')return fail('Staff session required',403);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const [account,profile,overrides,stores]=await Promise.all([
    admin.from('ch_staff_accounts').select('role_key,status,all_stores').eq('user_id',user.id).maybeSingle(),
    admin.from('user_profiles').select('is_active,profile_role').eq('id',user.id).maybeSingle(),
    admin.from('ch_staff_permission_overrides').select('permission_key,allowed').eq('user_id',user.id),
    admin.from('ch_staff_store_access').select('store_id').eq('user_id',user.id)
  ]);
  if(account.error||profile.error||overrides.error||stores.error||!account.data||!profile.data)
    return fail('Staff access record unavailable',403);
  const {data:roleGrants,error:roleError}=await admin.from('ch_staff_permissions')
    .select('permission_key').eq('role_key',account.data.role_key);
  if(roleError)return fail('Role permission lookup unavailable',503);

  const storeIds=(stores.data||[]).map(row=>row.store_id);
  const active=process.env.CENTRALHUB_STAFF_ACCESS_VERIFIED==='true' &&
    account.data.status==='active' &&
    profile.data.is_active===true && profile.data.profile_role==='user' &&
    user.app_metadata?.must_change_password===false &&
    (account.data.all_stores===true||storeIds.length>0);

  const effectivePermissions=new Set<string>();
  if(active){
    for(const row of roleGrants||[]){
      if(isStaffAssignablePermission(row.permission_key))effectivePermissions.add(row.permission_key);
    }
    for(const row of overrides.data||[]){
      if(!isStaffAssignablePermission(row.permission_key))continue;
      if(row.allowed)effectivePermissions.add(row.permission_key);
      else effectivePermissions.delete(row.permission_key);
    }
  }
  return NextResponse.json({
    active,status:account.data.status,role_key:account.data.role_key,
    must_change_password:user.app_metadata?.must_change_password===true,
    all_stores:account.data.all_stores===true,
    store_ids:storeIds,
    permissions:Array.from(effectivePermissions)
  },{headers:{'Cache-Control':'no-store, private','Vary':'Authorization'}});
}

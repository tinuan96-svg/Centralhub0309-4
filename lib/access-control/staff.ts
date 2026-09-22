import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isStaffAssignablePermission } from './catalog';

export class StaffAccessDenied extends Error {
  constructor(message:string,public readonly status:number){super(message);}
}
export type StaffContext={
  admin:SupabaseClient;
  userId:string;
  fullName:string;
  role:string;
  allStores:boolean;
  storeIds:string[];
  permissions:string[];
};

function clients(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const privateKey=process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!publicKey||!privateKey)throw new StaffAccessDenied('Staff service is not configured',503);
  return {
    publicClient:createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}}),
    admin:createClient(url,privateKey,{auth:{persistSession:false,autoRefreshToken:false}})
  };
}

/** Every staff request rechecks a live, trusted Supabase Auth identity and the
 * current database status. Never rely on editable user_metadata, a UI switch,
 * stale JWT permissions or a client-provided store assignment. */
export async function requireStaffContext(request:Request):Promise<StaffContext>{
  if(process.env.CENTRALHUB_STAFF_ACCESS_VERIFIED!=='true') {
    throw new StaffAccessDenied('Staff access has not passed security verification',503);
  }
  const header=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(header)) throw new StaffAccessDenied('Sign in required',401);
  const token=header.replace(/^Bearer\s+/i,'');
  const {publicClient,admin}=clients();
  const {data:{user},error}=await publicClient.auth.getUser(token);
  if(error||!user)throw new StaffAccessDenied('Expired or invalid session',401);
  const {data:identity,error:identityError}=await admin.auth.admin.getUserById(user.id);
  if(identityError||!identity.user||identity.user.app_metadata?.role!=='staff'){
    throw new StaffAccessDenied('This is not a staff login',403);
  }
  if(identity.user.app_metadata?.must_change_password!==false)
    throw new StaffAccessDenied('Change your temporary password before requesting access',403);
  const [staff,profile,stores,overrides,rolePermissions]=await Promise.all([
    admin.from('ch_staff_accounts').select('role_key,status,all_stores,full_name').eq('user_id',user.id).maybeSingle(),
    admin.from('user_profiles').select('is_active,profile_role').eq('id',user.id).maybeSingle(),
    admin.from('ch_staff_store_access').select('store_id').eq('user_id',user.id),
    admin.from('ch_staff_permission_overrides').select('permission_key,allowed').eq('user_id',user.id),
    admin.from('ch_staff_roles').select('role_key').limit(1)
  ]);
  if(staff.error||profile.error||stores.error||overrides.error||rolePermissions.error)
    throw new StaffAccessDenied('Unable to verify current staff permissions',503);
  if(staff.data?.status!=='active'||!profile.data?.is_active||profile.data.profile_role!=='user')
    throw new StaffAccessDenied('Your Super Admin has not activated this account',403);
  const {data:roleGrants,error:roleError}=await admin.from('ch_staff_permissions')
    .select('permission_key').eq('role_key',staff.data.role_key);
  if(roleError)throw new StaffAccessDenied('Unable to verify role permissions',503);
  const effective=new Set<string>((roleGrants||[]).map(r=>r.permission_key).filter(isStaffAssignablePermission));
  for(const override of overrides.data||[]){
    if(!isStaffAssignablePermission(override.permission_key))continue;
    if(override.allowed) effective.add(override.permission_key);
    else effective.delete(override.permission_key);
  }
  const storeIds=(stores.data||[]).map(s=>s.store_id);
  if(!staff.data.all_stores&&!storeIds.length)
    throw new StaffAccessDenied('No stores have been assigned to this account',403);
  return {admin,userId:user.id,fullName:staff.data.full_name||'',role:staff.data.role_key,
    allStores:staff.data.all_stores,storeIds,permissions:Array.from(effective)};
}

export function requireStaffPermission(context:StaffContext,permission:string,storeId:string){
  if(!isStaffAssignablePermission(permission)||!context.permissions.includes(permission))
    throw new StaffAccessDenied('This feature is not assigned to your account',403);
  if(!storeId||(!context.allStores&&!context.storeIds.includes(storeId)))
    throw new StaffAccessDenied('This store is outside your assigned access',403);
}
export function staffErrorResponse(error:unknown){
  if(error instanceof StaffAccessDenied)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  console.error('Staff operation failed',error instanceof Error?error.message:'Unexpected error');
  return Response.json({error:'Staff request could not be completed'},{status:500,headers:{'Cache-Control':'no-store'}});
}

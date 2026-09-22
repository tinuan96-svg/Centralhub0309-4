import { NextResponse } from 'next/server';
import { AccessDenied, requireVerifiedSuperAdmin } from '@/lib/access-control/admin';
import { isStaffPermission, isStaffRole, type StaffRole } from '@/lib/access-control/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond = (error: string, status: number) => NextResponse.json({ error }, { status });
type StaffInput = {
  email?: unknown;
  full_name?: unknown;
  role_key?: unknown;
  permissions?: unknown;
  store_ids?: unknown;
  all_stores?: unknown;
  status?: unknown;
  user_id?: unknown;
};
function parseAssignment(value: StaffInput) {
  const roleKey = value.role_key;
  const permissions = value.permissions;
  const storeIds = value.store_ids;
  if (!isStaffRole(roleKey) || !Array.isArray(permissions) ||
      permissions.length > 100 || !permissions.every(isStaffPermission) ||
      !Array.isArray(storeIds) || storeIds.length > 50 ||
      !storeIds.every((id) => typeof id === 'string' && UUID.test(id)) ||
      typeof value.all_stores !== 'boolean') {
    throw new AccessDenied('Invalid role, store or permission assignment', 400);
  }
  const distinctPermissions = [...new Set(permissions as string[])];
  const distinctStores = [...new Set(storeIds as string[])];
  if (!value.all_stores && distinctStores.length === 0) {
    throw new AccessDenied('Select at least one store or All Stores', 400);
  }
  return { roleKey: roleKey as StaffRole, permissions: distinctPermissions,
    storeIds: value.all_stores ? [] : distinctStores, allStores: value.all_stores };
}
async function verifyStores(admin: any, ids: string[]) {
  if (!ids.length) return;
  const { data, error } = await admin.from('stores').select('id').in('id', ids);
  if (error || data?.length !== ids.length) throw new AccessDenied('Unknown store selection', 400);
}
function handleError(error: unknown) {
  if (error instanceof AccessDenied) return respond(error.message, error.status);
  console.error('Staff directory request failed', error instanceof Error ? error.message : 'Unknown error');
  return respond('Staff directory could not complete the request', 500);
}
async function readDirectory(admin: any) {
  const [users, profiles, stores, scopes, overrides] = await Promise.all([
    admin.from('ch_staff_accounts').select('user_id,role_key,full_name,status,all_stores,created_at').order('created_at',{ ascending: false }),
    admin.from('user_profiles').select('id,email,full_name,is_active,profile_role'),
    admin.from('stores').select('id,name,slug').order('name'),
    admin.from('ch_staff_store_access').select('user_id,store_id'),
    admin.from('ch_staff_permission_overrides').select('user_id,permission_key,allowed')
  ]);
  for (const response of [users,profiles,stores,scopes,overrides]) {
    if (response.error) throw new AccessDenied('Staff database not ready: migration is required', 503);
  }
  const profilesById = new Map((profiles.data || []).map((p:any) => [p.id,p]));
  return {
    staff: (users.data || []).map((user:any) => ({
      ...user, email: profilesById.get(user.user_id)?.email || '',
      store_ids: (scopes.data || []).filter((scope:any) => scope.user_id===user.user_id).map((scope:any)=>scope.store_id),
      permissions: (overrides.data || []).filter((permission:any) => permission.user_id===user.user_id && permission.allowed).map((permission:any)=>permission.permission_key),
    })),
    administrators: (profiles.data || []).filter((p:any)=>p.profile_role==='admin')
      .map((p:any)=>({id:p.id,email:p.email,full_name:p.full_name,is_active:p.is_active})),
    stores: stores.data || [],
    invitesEnabled: process.env.CENTRALHUB_STAFF_INVITES_ENABLED === 'true',
    activationEnabled: process.env.CENTRALHUB_STAFF_ACCESS_VERIFIED === 'true',
  };
}
export async function GET(request: Request) {
  try { const { admin } = await requireVerifiedSuperAdmin(request);
    return NextResponse.json(await readDirectory(admin));
  } catch (error) { return handleError(error); }
}
export async function POST(request: Request) {
  if (process.env.CENTRALHUB_STAFF_INVITES_ENABLED !== 'true') {
    return respond('Invitations are disabled until the end-to-end staff access audit passes', 503);
  }
  try {
    const { admin, actorId } = await requireVerifiedSuperAdmin(request);
    const input = await request.json() as StaffInput;
    const email = typeof input.email==='string' ? input.email.trim().toLowerCase() : '';
    const fullName = typeof input.full_name==='string' ? input.full_name.trim() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      fullName.length < 1 || fullName.length > 120) throw new AccessDenied('Valid name and email are required',400);
    const assignment = parseAssignment(input);
    await verifyStores(admin,assignment.storeIds);
    // Invite-only, never create a password on behalf of the staff member.
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email,{data:{full_name:fullName}});
    if (inviteError || !invite.user) throw new AccessDenied('Could not invite user; check if the email is already registered',409);
    const invitedId = invite.user.id;
    try {
      const { error: metadataError } = await admin.auth.admin.updateUserById(invitedId,{
        app_metadata: { ...invite.user.app_metadata, role:'staff' }
      });
      if (metadataError) throw metadataError;
      const { error: profileError } = await admin.from('user_profiles')
        .upsert({id:invitedId,email,full_name:fullName,profile_role:'user',is_active:false},{onConflict:'id'});
      if (profileError) throw profileError;
      const { error: staffError } = await admin.from('ch_staff_accounts')
        .insert({ user_id:invitedId, role_key:assignment.roleKey, full_name:fullName,
          status:'pending', all_stores:assignment.allStores });
      if (staffError) throw staffError;
      if (assignment.storeIds.length) {
        const {error} = await admin.from('ch_staff_store_access').insert(
          assignment.storeIds.map(store_id => ({user_id:invitedId,store_id})));
        if(error) throw error;
      }
      if (assignment.permissions.length) {
        const {error} = await admin.from('ch_staff_permission_overrides').insert(
          assignment.permissions.map(permission_key => ({user_id:invitedId,permission_key,allowed:true})));
        if(error) throw error;
      }
      const {error: auditError} = await admin.from('ch_staff_access_audit').insert({
        actor_id:actorId,target_user_id:invitedId,action:'invite',
        after_state:{role_key:assignment.roleKey,permissions:assignment.permissions,
          store_ids:assignment.storeIds,all_stores:assignment.allStores,status:'pending'}
      });
      if(auditError) throw auditError;
      return NextResponse.json({success:true,user_id:invitedId,status:'pending'}, {status:201});
    } catch (error) {
      // Fail closed: don't leave an unassigned but authenticated staff account.
      await admin.auth.admin.deleteUser(invitedId).catch(()=>{});
      throw error;
    }
  } catch (error) { return handleError(error); }
}
export async function PATCH(request: Request) {
  try {
    const { admin, actorId } = await requireVerifiedSuperAdmin(request);
    const input = await request.json() as StaffInput;
    const userId = typeof input.user_id==='string' ? input.user_id : '';
    if (!UUID.test(userId) || userId === actorId) throw new AccessDenied('Invalid staff account',400);
    const assignment = parseAssignment(input);
    await verifyStores(admin,assignment.storeIds);
    const {data: before, error: findError} = await admin.from('ch_staff_accounts')
      .select('*').eq('user_id',userId).maybeSingle();
    if(findError || !before) throw new AccessDenied('Staff account not found',404);
    const status = input.status;
    if(status!=='pending' && status!=='active' && status!=='suspended') {
      throw new AccessDenied('Invalid staff status',400);
    }
    if(status==='active' && process.env.CENTRALHUB_STAFF_ACCESS_VERIFIED!=='true') {
      throw new AccessDenied('Staff activation blocked until full access-control verification',403);
    }
    // Suspend while updating scope so old permissions cannot be used mid-change.
    const { error: suspendError } = await admin.from('ch_staff_accounts')
      .update({ status:'suspended' }).eq('user_id',userId);
    if(suspendError) throw suspendError;
    const operations = await Promise.all([
      admin.from('ch_staff_store_access').delete().eq('user_id',userId),
      admin.from('ch_staff_permission_overrides').delete().eq('user_id',userId)
    ]);
    if(operations.some(result=>result.error)) throw new Error('Could not revoke previous permissions');
    if(assignment.storeIds.length) {
      const {error} = await admin.from('ch_staff_store_access').insert(
        assignment.storeIds.map(store_id=>({user_id:userId,store_id})));
      if(error) throw error;
    }
    if(assignment.permissions.length) {
      const {error} = await admin.from('ch_staff_permission_overrides').insert(
        assignment.permissions.map(permission_key=>({user_id:userId,permission_key,allowed:true})));
      if(error) throw error;
    }
    const {error: profileError} = await admin.from('user_profiles')
      .update({is_active:status==='active'}).eq('id',userId);
    if(profileError) throw profileError;
    const {error:updateError} = await admin.from('ch_staff_accounts')
      .update({role_key:assignment.roleKey,all_stores:assignment.allStores,
        status,updated_at:new Date().toISOString()}).eq('user_id',userId);
    if(updateError) throw updateError;
    const {error:auditError} = await admin.from('ch_staff_access_audit').insert({
      actor_id:actorId,target_user_id:userId,action:'update',
      before_state:before,
      after_state:{role_key:assignment.roleKey,permissions:assignment.permissions,
        store_ids:assignment.storeIds,all_stores:assignment.allStores,status}
    });
    if(auditError) console.error('Staff audit log write failed; manual review required');
    return NextResponse.json({success:true});
  } catch(error) { return handleError(error); }
}

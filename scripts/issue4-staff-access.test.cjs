'use strict';

// Foundation regression tests only: these do NOT establish complete server,
// RLS, storage, RPC, cross-store or Android end-to-end access security.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const read = path => fs.readFileSync(path, 'utf8');
const src = read('lib/access-control/catalog.ts');
const moduleObject = {exports:{}};
vm.runInNewContext(ts.transpileModule(src, {
  compilerOptions: {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}
}).outputText,{module:moduleObject,exports:moduleObject.exports});
const catalog=moduleObject.exports;

test('role templates are valid and have no super-admin actions',()=>{
  const permissions=new Set(catalog.PERMISSION_KEYS);
  assert.ok(permissions.size>40);
  assert.equal(permissions.size,catalog.PERMISSION_KEYS.length,'duplicate permissions');
  assert.equal(catalog.STAFF_ROLES.length,7);
  for(const role of catalog.STAFF_ROLES) {
    const preset=catalog.STAFF_ROLE_PRESETS[role.key];
    assert.ok(Array.isArray(preset),role.key);
    for(const permission of preset) {
      assert.ok(permissions.has(permission),`unrecognized ${permission}`);
      assert.ok(!permission.startsWith('users.') && permission!=='security.manage',
        'role presets cannot grant staff administration');
    }
  }
  assert.ok(!catalog.isStaffPermission('superadmin'));
  assert.ok(!catalog.isStaffRole('admin'));
  assert.ok(!catalog.isStaffAssignablePermission('users.manage'));
  assert.ok(!catalog.isStaffAssignablePermission('users.view'));
  assert.ok(!catalog.isStaffAssignablePermission('security.manage'));
  assert.ok(catalog.isStaffAssignablePermission('orders.view'));
});
test('manual staff login is server-created, pending and not an invitation',()=>{
  const route=read('app/api/admin/staff/route.ts');
  assert.match(route,/requireVerifiedSuperAdmin\(request\)/);
  assert.match(route,/admin\.auth\.admin\.createUser\(/);
  assert.doesNotMatch(route,/inviteUserByEmail\(/);
  assert.match(route,/randomBytes\(32\)/);
  assert.match(route,/CENTRALHUB_STAFF_CREATION_ENABLED/);
  assert.match(route,/CENTRALHUB_STAFF_ACCESS_VERIFIED/);
  assert.match(route,/status:'pending'/);
  assert.match(route,/must_change_password: true/);
  assert.match(route,/temporary_password: temporaryPassword/);
  assert.match(route,/status==='active'/);
  assert.match(route,/must_change_password!==false/);
});
test('staff password setup is separate from explicit admin activation',()=>{
  const route=read('app/api/staff/first-login/route.ts');
  assert.match(route,/admin\.auth\.admin\.getUserById\(user\.id\)/);
  assert.match(route,/must_change_password!==true/);
  assert.match(route,/staff\.status==='active'/);
  assert.match(route,/updateUserById\(user\.id/);
  assert.match(route,/must_change_password:false/);
  assert.doesNotMatch(route,/status\s*:\s*['"]active['"]/);
});
test('staff workspace requires authoritative active access and assigned route permission',()=>{
  const auth=read('components/AuthProvider.tsx');
  assert.match(auth,/fetch\('\/api\/staff\/access'/);
  assert.match(auth,/staffNeedsSetup=isStaff&&\(!staffAccess\?\.active\|\|staffAccess\.must_change_password\)/);
  assert.match(auth,/staffPathAllowed=pathname==='\/dashboard'/);
  assert.match(auth,/isStaff&&session\?<StaffWorkspace/);
  assert.match(auth,/staffRouteDenied/);
  assert.doesNotMatch(auth,/suppressHydrationWarning>\{children\}/);
  assert.match(auth,/setInterval\(\(\)=>\{void verify\(\);\},30000\)/);
  const workspace=read('components/StaffWorkspace.tsx');
  assert.match(workspace,/\/api\/staff\/context/);
  assert.match(workspace,/\/api\/staff\/records/);
  assert.doesNotMatch(workspace,/from\(['"]orders['"]\)/);
  const access=read('app/api/staff/access/route.ts');
  assert.match(access,/auth\.getUser\(bearer\.slice\(7\)\)/);
  assert.match(access,/account\.data\.status==='active'/);
  assert.match(access,/must_change_password===false/);
  const routes=read('lib/access-control/routes.ts');
  assert.match(routes,/return required\.length>0/);
});

test('only server-verified active Super Admin can mount the legacy admin workspace',()=>{
  const auth=read('components/AuthProvider.tsx');
  const endpoint=read('app/api/auth/admin-session/route.ts');
  assert.match(auth,/verifiedAdminSessionToken===session\?\.access_token/);
  assert.match(auth,/fetch\('\/api\/auth\/admin-session'/);
  assert.match(auth,/user&&!isAdmin\?</);
  assert.match(endpoint,/requireVerifiedSuperAdmin\(request\)/);
  assert.match(endpoint,/Cache-Control'\s*:\s*'no-store, private'/);
});

test('staff records API uses allowlisted columns and scoped server-side queries',()=>{
  const route=read('app/api/staff/records/route.ts');
  assert.match(route,/requireStaffContext\(request\)/);
  assert.match(route,/requireStaffPermission\(context,resource\.permission,storeId\)/);
  assert.match(route,/if\(section==='procurement'&&!context\.allStores\)/);
  assert.match(route,/if\(section!=='procurement'\)query=query\.eq\('store_id',storeId\)/);
  assert.doesNotMatch(route,/\.select\('\*'\)/);
});

test('current administrator RLS privilege requires live auth and active profile, never stale JWT admin claim',()=>{
  const sql=read('supabase/migrations/20260922175000_trusted_live_admin_role.sql');
  assert.match(sql,/join public\.user_profiles p on p\.id = u\.id/);
  assert.match(sql,/u\.raw_app_meta_data->>'role' = 'admin'/);
  assert.match(sql,/p\.profile_role = 'admin'/);
  assert.match(sql,/p\.is_active = true/);
  assert.match(sql,/not exists \(/);
  assert.doesNotMatch(sql.split('as $')[1]||'',/auth\.jwt\(\)/);
});

test('support status action checks live staff scope and writes status plus audit atomically',()=>{
  const sql=read('supabase/migrations/20260922180000_staff_support_status_atomic.sql');
  assert.match(sql,/create or replace function public\.ch_staff_change_support_status/);
  assert.match(sql,/s\.status='active'/);
  assert.match(sql,/u\.raw_app_meta_data->>'role'='staff'/);
  assert.match(sql,/o\.permission_key='support\.edit'/);
  assert.match(sql,/o\.permission_key='support\.view'/);
  assert.match(sql,/a\.store_id=p_store_id/);
  assert.match(sql,/where id=p_ticket_id and store_id=p_store_id and status=p_expected_status/);
  assert.match(sql,/insert into public\.ch_staff_activity_audit/);
  assert.match(sql,/from public,anon,authenticated/);
  assert.match(sql,/to service_role/);
  const route=read('app/api/staff/support/status/route.ts');
  assert.match(route,/requireStaffContext\(request\)/);
  assert.match(route,/requireStaffPermission\(context,'support\.edit',storeId\)/);
  assert.match(route,/requireStaffPermission\(context,'support\.view',storeId\)/);
  assert.match(route,/\.rpc\('ch_staff_change_support_status'/);
  assert.match(route,/expected_status:expected,p_next_status:next/);
  const workspace=read('components/StaffWorkspace.tsx');
  assert.match(workspace,/context\.permissions\.includes\('support\.edit'\)/);
  assert.match(workspace,/\/api\/staff\/support\/status/);
});

test('sensitive staff writes require audited server actions, not unrestricted PostgREST updates',()=>{
  const sql=read('supabase/migrations/20260922181500_deny_unbounded_staff_direct_writes.sql');
  assert.match(sql,/policyname in \(/);
  assert.match(sql,/'ch_staff_strict_insert','ch_staff_strict_update','ch_staff_strict_delete'/);
  assert.match(sql,/with check \(not public\.ch_is_staff_identity\(\)\)/);
  assert.match(sql,/using \(not public\.ch_is_staff_identity\(\)\)/);
  assert.doesNotMatch(sql,/drop policy .*admin/i);
});

test('bank reconciliation edge preserves trusted automation and denies arbitrary signed-in users',()=>{
  const src=read('supabase/functions/sync-bank-statements/index.ts');
  assert.match(src,/internalServiceCall=Boolean\(role\)&&bearer===role/);
  assert.match(src,/getUserById\(user\.id\)/);
  assert.match(src,/profile\.profile_role!=="admin"/);
  assert.match(src,/account\?\.status!=="active"/);
  assert.match(src,/must_change_password!==false/);
  assert.match(src,/override\?\.allowed\?\?Boolean\(roleGrant\)/);
  assert.match(src,/CENTRALHUB_STAFF_ACCESS_VERIFIED/);
  assert.match(src,/staffStoreIds\.includes\(account\.store_id\)/);
  assert.match(src,/staffAllStores/);
  assert.match(src,/return reject\(403,"An authorised CentralHub account is required"\)/);
});

test('staff login is discoverable and cannot self-assert the Super Admin voice unlock',()=>{
  const login=read('app/login/LoginClient.tsx');
  assert.match(login,/Staff login/);
  assert.match(login,/const staffLogin = signedIn\.user\?\.app_metadata\?\.role === 'staff'/);
  assert.match(login,/if \(!staffLogin\)/);
  assert.match(login,/sessionStorage\.removeItem\('centralhub:shruthi-security-unlocked-at'\)/);
});

test('role presets cannot silently re-grant unchecked Super Admin feature boxes',()=>{
  const route=read('app/api/admin/staff/route.ts');
  assert.match(route,/async function explicitPermissionOverrides\(/);
  assert.match(route,/new Set<string>\(\[\.\.\.chosen,\.\.\.\(grants\|\|\[\]\)/);
  assert.match(route,/allowed:selected\.has\(permission_key\)/);
  assert.match(route,/const explicitOverrides=await explicitPermissionOverrides\(/);
  assert.match(route,/if\(override\.allowed\)effective\.add\(override\.permission_key\)/);
  assert.match(route,/else effective\.delete\(override\.permission_key\)/);
  const db=read('supabase/migrations/20260922163500_staff_authoritative_activation_role_grants.sql');
  assert.match(db,/coalesce\(/);
  assert.match(db,/ch_staff_permission_overrides/);
});

test('remote order-status synchronisation cannot be run by staff with orders.edit',()=>{
  const edge=read('supabase/functions/update-order-status/index.ts');
  assert.match(edge,/getUserById\(user\.id\)/);
  assert.match(edge,/identity\.user\.app_metadata\?\.role==="admin"/);
  assert.match(edge,/profile\.profile_role==="admin"/);
  assert.match(edge,/!staffRecord/);
  assert.match(edge,/if\(!trustedAdmin\) return reply/);
  assert.doesNotMatch(edge.replace(/^\s*\/\/.*$/gm,''),/orders\.edit/);
  assert.doesNotMatch(edge,/callerStaffContext/);
});

test('warehouse claiming requires active staff, two fulfilment permissions and one assigned store',()=>{
  const sql=read('supabase/migrations/20260922183000_staff_claim_picking_atomic.sql');
  assert.match(sql,/create or replace function public\.ch_staff_claim_picking/);
  assert.match(sql,/s\.status='active'/);
  assert.match(sql,/permission_key='fulfilment\.view'/);
  assert.match(sql,/permission_key='fulfilment\.pick'/);
  assert.match(sql,/a\.store_id=p_store_id/);
  assert.match(sql,/payment_status='paid'/);
  assert.match(sql,/warehouse_status='pending'/);
  assert.match(sql,/locked_by is null/);
  assert.match(sql,/and is_deleted=false/);
  assert.match(sql,/insert into public\.ch_staff_activity_audit/);
  assert.match(sql,/from public,anon,authenticated/);
  assert.match(sql,/to service_role/);
  assert.doesNotMatch(sql,/set order_status\s*=/);
  assert.doesNotMatch(sql,/set payment_status\s*=/);
  const route=read('app/api/staff/fulfilment/claim/route.ts');
  assert.match(route,/requireStaffContext\(request\)/);
  assert.match(route,/requireStaffPermission\(context,'fulfilment\.pick',storeId\)/);
  assert.match(route,/\.rpc\('ch_staff_claim_picking'/);
  const ui=read('components/StaffWorkspace.tsx');
  assert.match(ui,/context\.permissions\.includes\('fulfilment\.pick'\)/);
  assert.match(ui,/\/api\/staff\/fulfilment\/claim/);
});

test('private order-sync and cross-store sync status endpoints reject anonymous and staff callers',()=>{
  const api=read('app/api/sync-orders/route.ts');
  const client=read('lib/services/orderSyncClient.ts');
  const status=read('app/api/sync-orders/status/route.ts');
  const remoteStatus=read('app/api/orders/update-status/route.ts');
  assert.match(api,/async function requireSyncCaller\(req: Request\)/);
  assert.match(api,/requireVerifiedSuperAdmin\(req\)/);
  assert.match(api,/CENTRALHUB_ORDER_SYNC_API_SECRET/);
  assert.match(api,/const callerDenied = await requireSyncCaller\(req\)/);
  assert.match(client,/const token = await getAccessToken\(\)/);
  assert.match(client,/Authorization: `Bearer \$\{token\}`/);
  assert.match(status,/await requireVerifiedSuperAdmin\(req\)/);
  assert.doesNotMatch(status,/getUserFromRequest/);
  assert.match(remoteStatus,/await requireVerifiedSuperAdmin\(req\)/);
  assert.doesNotMatch(remoteStatus,/await requireAdmin\(\)/);
});

test('administrator push endpoints cannot enroll unassigned staff for global notifications',()=>{
  for(const path of [
    'app/api/push/native/route.ts',
    'app/api/push/subscribe/route.ts',
    'app/api/push/test/route.ts',
    'app/api/push/event/route.ts'
  ]){
    const src=read(path);
    assert.match(src,/requireVerifiedSuperAdmin\(req\)/,path);
  }
});

test('picking completion is actor-owned, line-complete, permissioned and audited',()=>{
 const sql=read('supabase/migrations/20260922184500_staff_complete_picking_atomic.sql');
 assert.match(sql,/permission_key='fulfilment\.pick'/);
 assert.match(sql,/locked_by=p_actor and picked_by_user=p_actor/);
 assert.match(sql,/coalesce\(i\.picked_quantity,0\)<i\.quantity/);
 assert.match(sql,/i\.skip_reason is null/);
 assert.match(sql,/payment_status='paid'/);
 assert.match(sql,/warehouse_status='picking'/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/set payment_status\s*=/);
 const route=read('app/api/staff/fulfilment/complete/route.ts');
 assert.match(route,/requireStaffPermission\(context,'fulfilment\.pick',storeId\)/);
 assert.match(route,/\.rpc\('ch_staff_complete_picking'/);
 assert.match(route,/duration>43200/);
});

test('staff schema remains private and default-deny',()=>{
  const sql=read('supabase/migrations/20260922133000_issue4_staff_rbac_foundation.sql');
  assert.match(sql,/revoke all on table public\.ch_staff_roles/);
  assert.match(sql,/alter table public\.ch_staff_accounts enable row level security/);
  assert.doesNotMatch(sql,/create policy .*staff.* using\s*\(\s*true\s*\)/i);
});
test('privileged cross-store order deletion checks caller and store binding',()=>{
  const route=read('app/api/orders/delete/route.ts');
  assert.match(route,/await requireVerifiedSuperAdmin\(req\)/);
  assert.doesNotMatch(route,/requireStaffPermission/);
  assert.doesNotMatch(route,/requireStaffContext/);
  assert.match(route,/order\.store_id !== store\.id/);
  const caller=read('lib/services/orderService.ts');
  assert.match(caller,/Authorization: `Bearer \$\{session\.access_token\}`/);
});

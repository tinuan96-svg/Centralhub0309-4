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
test('EXECUTED staff permission guard denies cross-store and reserved actions',()=>{
  // Exercise the actual TypeScript helper, not merely a regex against its source.
  const staffModule={exports:{}};
  const compiled=ts.transpileModule(read('lib/access-control/staff.ts'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  vm.runInNewContext(compiled,{
    module:staffModule,exports:staffModule.exports,
    require(id){
      if(id==='./catalog')return catalog;
      if(id==='@supabase/supabase-js')return {createClient:()=>{throw new Error('Unexpected network call in guard test')}};
      throw new Error('Unknown import in guard test: '+id);
    },
    process:{env:{}},console
  });
  const guard=staffModule.exports.requireStaffPermission;
  const assignedStore='00000000-0000-4000-8000-000000000001';
  const otherStore='00000000-0000-4000-8000-000000000002';
  const scope={permissions:['orders.view','fulfilment.dispatch'],allStores:false,storeIds:[assignedStore]};
  assert.doesNotThrow(()=>guard(scope,'orders.view',assignedStore));
  assert.throws(()=>guard(scope,'orders.view',otherStore),e=>e.status===403);
  assert.throws(()=>guard(scope,'orders.delete',assignedStore),e=>e.status===403);
  assert.throws(()=>guard({...scope,permissions:['users.manage']},'users.manage',assignedStore),e=>e.status===403);
  assert.throws(()=>guard({...scope,storeIds:[]},'orders.view',assignedStore),e=>e.status===403);
  assert.throws(()=>guard({...scope,allStores:true},'finance.view',otherStore),e=>e.status===403);
  assert.doesNotThrow(()=>guard({...scope,allStores:true},'orders.view',otherStore));
  assert.throws(()=>guard(scope,'orders.view',''),e=>e.status===403);
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

test('staff picking scan validates barcode, ownership and synchronized item counters atomically',()=>{
 const sql=read('supabase/migrations/20260922191000_staff_scan_picking_item_atomic.sql');
 assert.match(sql,/create or replace function public\.ch_staff_scan_picking_item/);
 assert.match(sql,/s\.status='active'/);
 assert.match(sql,/o\.store_id=p_store_id/);
 assert.match(sql,/o\.locked_by=p_actor and o\.picked_by_user=p_actor/);
 assert.match(sql,/permission_key='fulfilment\.pick'/);
 assert.match(sql,/where oi\.id=p_order_item_id and oi\.order_id=p_order_id/);
 assert.match(sql,/p\.gtin/);
 assert.match(sql,/p\.sku/);
 assert.match(sql,/v_matches<>1/);
 assert.match(sql,/v_old\+1/);
 assert.match(sql,/jsonb_set\(v_items/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 const route=read('app/api/staff/fulfilment/scan/route.ts');
 assert.match(route,/requireStaffPermission\(context,'fulfilment\.pick',storeId\)/);
 assert.match(route,/order\.locked_by!==context\.userId/);
 assert.match(route,/\.rpc\('ch_staff_scan_picking_item'/);
 const panel=read('components/StaffPickingPanel.tsx');
 assert.match(panel,/\/api\/staff\/fulfilment\/scan/);
 assert.match(panel,/\/api\/staff\/fulfilment\/complete/);
});
test('picking completion requires real, consistent line evidence even when order_items is empty',()=>{
 const sql=read('supabase/migrations/20260922190000_picking_completion_requires_all_lines.sql');
 assert.match(sql,/if not exists\(select 1 from public\.order_items/);
 assert.match(sql,/picking_lines_missing/);
 assert.match(sql,/jsonb_array_elements/);
 assert.match(sql,/picking_json_lines_missing/);
 assert.match(sql,/picking_json_lines_incomplete/);
});
test('packing completion is verified, store-scoped, permissioned and audited',()=>{
 const sql=read('supabase/migrations/20260922190000_staff_complete_packing_atomic.sql');
 assert.match(sql,/permission_key='fulfilment\.pack'/);
 assert.match(sql,/coalesce\(i\.verified_quantity,0\)<i\.quantity/);
 assert.match(sql,/warehouse_status='packing'/);
 assert.match(sql,/order_status='packing'/);
 assert.match(sql,/payment_status='paid'/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/order_packaging_allocations/);
 assert.doesNotMatch(sql,/packaging_materials/);
 const route=read('app/api/staff/fulfilment/pack/route.ts');
 assert.match(route,/requireStaffPermission\(context,'fulfilment\.pack',storeId\)/);
 assert.match(route,/\.rpc\('ch_staff_complete_packing'/);
 const ui=read('components/StaffWorkspace.tsx');
 assert.match(ui,/context\.permissions\.includes\('fulfilment\.pack'\)/);
 const panel=read('components/StaffPackingPanel.tsx');
 assert.match(panel,/\/api\/staff\/fulfilment\/pack/);
 assert.match(panel,/\/api\/staff\/fulfilment\/verify/);
});

test('packing cannot mark empty or incompletely verified orders as packed',()=>{
 const sql=read('supabase/migrations/20260922192500_staff_packing_nonempty_verified_lines.sql');
 assert.match(sql,/for update/);
 assert.match(sql,/packing_lines_missing/);
 assert.match(sql,/i\.verified_quantity<>i\.quantity/);
 assert.match(sql,/packing_json_lines_missing/);
 assert.match(sql,/jsonb_array_elements/);
 assert.match(sql,/packing_json_verification_incomplete/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
});
test('packing scan updates only exact barcode-matched item quantities in one audited transaction',()=>{
 const sql=read('supabase/migrations/20260922191500_staff_verify_packing_barcode_atomic.sql');
 assert.match(sql,/create or replace function public\.ch_staff_verify_packing_item/);
 assert.match(sql,/s\.status='active'/);
 assert.match(sql,/permission_key='fulfilment\.pack'/);
 assert.match(sql,/o\.warehouse_status='packing'/);
 assert.match(sql,/o\.store_id=p_store_id/);
 assert.match(sql,/p\.gtin/);
 assert.match(sql,/v_matches<>1/);
 assert.match(sql,/verified_quantity=v_new/);
 assert.match(sql,/items=jsonb_set\(v_json/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 const route=read('app/api/staff/fulfilment/verify/route.ts');
 assert.match(route,/requireStaffPermission\(context,'fulfilment\.pack',storeId\)/);
 assert.match(route,/\.rpc\('ch_staff_verify_packing_item'/);
 assert.match(route,/\.eq\('store_id',storeId\)/);
 const panel=read('components/StaffPackingPanel.tsx');
 assert.match(panel,/\/api\/staff\/fulfilment\/verify/);
 assert.match(panel,/\/api\/staff\/fulfilment\/pack/);
 const workspace=read('components/StaffWorkspace.tsx');
 assert.match(workspace,/<StaffPackingPanel/);
});

test('packing cannot finish with missing, unmatched, skipped or partially scanned items',()=>{
 const sql=read('supabase/migrations/20260922192000_staff_pack_line_integrity_gate.sql');
 assert.match(sql,/for update/);
 assert.match(sql,/packing_lines_missing/);
 assert.match(sql,/packing_line_count_mismatch/);
 assert.match(sql,/packing_snapshot_mismatch/);
 assert.match(sql,/coalesce\(i\.picked_quantity,0\)<>i\.quantity/);
 assert.match(sql,/coalesce\(i\.verified_quantity,0\)<>i\.quantity/);
 assert.match(sql,/nullif\(pg_catalog\.btrim\(i\.skip_reason\)/);
});
test('dispatch readiness exposes only store-scoped shipment evidence and never mutates shipping state',()=>{
  const route=read('app/api/staff/fulfilment/dispatch-readiness/route.ts');
  assert.match(route,/requireStaffContext\(request\)/);
  assert.match(route,/requireStaffPermission\(context,'fulfilment\.view',storeId\)/);
  assert.match(route,/requireStaffPermission\(context,'shipping\.view',storeId\)/);
  assert.match(route,/requireStaffPermission\(context,'fulfilment\.dispatch',storeId\)/);
  assert.match(route,/\.eq\('id',orderId\)\.eq\('store_id',storeId\)/);
  assert.match(route,/\.eq\('order_id',orderId\)/);
  assert.match(route,/ready_for_handover:issues\.length===0/);
  assert.match(route,/dispatch_action_available:handoverAllowed/);
  assert.match(route,/context\.permissions\.includes\('shipping\.edit'\)/);
  assert.doesNotMatch(route,/\.update\(|\.insert\(|\.delete\(|\.rpc\(|\.invoke\(/);
  assert.doesNotMatch(route,/recipient_name|recipient_address|shipping_cost|label_url/);
  const panel=read('components/StaffDispatchReadinessPanel.tsx');
  assert.match(panel,/\/api\/staff\/fulfilment\/dispatch-readiness/);
  assert.match(panel,/\/api\/staff\/shipping\/handover/);
  assert.match(panel,/physical_handover_confirmed:true/);
  const workspace=read('components/StaffWorkspace.tsx');
  assert.match(workspace,/<StaffDispatchReadinessPanel/);
  assert.match(workspace,/context\.permissions\.includes\('fulfilment\.dispatch'\)/);
});

test('handover requires a live staff identity and four permissions and changes one booked shipment',()=>{
 const sql=read('supabase/migrations/20260922202000_staff_courier_handover_atomic.sql');
 const api=read('app/api/staff/shipping/handover/route.ts');
 const panel=read('components/StaffDispatchReadinessPanel.tsx');
 for(const permission of ['fulfilment.view','fulfilment.dispatch','shipping.view','shipping.edit']){
  assert.ok(sql.includes("'"+permission+"'"));
  assert.ok(api.includes("'"+permission+"'"));
 }
 assert.match(sql,/s\.status='active'/);
 assert.match(sql,/x\.store_id=p_store_id/);
 assert.match(sql,/where id=p_shipment_id and order_id=p_order_id for update/);
 assert.match(sql,/s\.label_printed is distinct from true/);
 assert.match(sql,/v_active<>1/);
 assert.match(sql,/s\.status<>'label_created'/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/insert into public\.shipment_events/);
 assert.match(sql,/to service_role/);
 assert.match(api,/physical_handover_confirmed!==true/);
 assert.match(panel,/onChange=\{e=>setConfirmed\(e\.target\.checked\)\}/);
 assert.match(panel,/\/api\/staff\/shipping\/handover/);
 assert.doesNotMatch(api,/DHLService|createShipment|shipping_cost|\.from\('orders'\)\.update/);
});
test('billing review is non-posting, store-scoped, audited, and requires explicit billing rights',()=>{
 const sql=read('supabase/migrations/20260922204000_staff_billing_and_accounting_review.sql');
 const api=read('app/api/staff/billing/review/route.ts');
 const client=read('components/StaffFinancialActionPanel.tsx');
 for(const permission of ['billing.view','billing.edit']){
  assert.ok(sql.includes("'"+permission+"'"));assert.ok(api.includes("'"+permission+"'"));
 }
 assert.match(sql,/create table if not exists public\.ch_staff_billing_reviews/);
 assert.match(sql,/where id=p_document_id and store_id=p_store_id for update/);
 assert.match(sql,/p_decision='reviewed'/);
 assert.match(sql,/insert into public\.ch_staff_billing_reviews/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/to service_role/);
 assert.match(api,/posting_changed:false,invoice_issued:false/);
 assert.match(client,/\/api\/staff\/billing\/review/);
 assert.doesNotMatch(api,/posting_status:'posted'|createInvoice|payment_status:'paid'/);
});
test('accounting categorization cannot change balance, transaction amount or settled flags',()=>{
 const sql=read('supabase/migrations/20260922204000_staff_billing_and_accounting_review.sql');
 const api=read('app/api/staff/accounting/classify/route.ts');
 for(const permission of ['finance.view','finance.edit']){
  assert.ok(sql.includes("'"+permission+"'")); assert.ok(api.includes("'"+permission+"'"));
 }
 assert.match(sql,/where id=p_bank_transaction_id and store_id=p_store_id for update/);
 assert.match(sql,/v_row\.is_reconciled is true/);
 assert.match(sql,/classification_status='classified'/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/);
 assert.match(sql,/to service_role/);
 assert.match(api,/amount_changed:false,reconciled:false/);
 assert.doesNotMatch(api,/\.update\(|\.insert\(/);
});
test('shipping booking stays ready-to-ship until explicit audited physical handover',()=>{
 const service=read('lib/services/shipping/shippingService.ts');
 assert.match(service,/order_status: 'ready_to_ship'/);
 assert.match(service,/warehouse_status: 'ready_to_ship'/);
 assert.match(service,/shipment_status: 'label_created'/);
 assert.doesNotMatch(service,/order_status: 'shipment_booked',[\s\S]{0,120}warehouse_status: 'dispatched'/);
 const handover=read('app/api/staff/shipping/handover/route.ts');
 assert.match(handover,/\['fulfilment\.view','fulfilment\.dispatch','shipping\.view','shipping\.edit'\]/);
 assert.match(handover,/requireStaffPermission\(context,permission,storeId\)/);
 assert.match(handover,/physical_handover_confirmed!==true/);
 assert.match(handover,/ch_staff_confirm_courier_handover/);
 const readiness=read('app/api/staff/fulfilment/dispatch-readiness/route.ts');
 assert.match(readiness,/dispatch_action_available:(?:handoverAllowed|issues\.length===0)/);
 const panel=read('components/StaffDispatchReadinessPanel.tsx');
 assert.match(panel,/physical_handover_confirmed:true/);
 assert.match(panel,/\/api\/staff\/shipping\/handover/);
});

test('billing and accounting staff writes remain bounded, store-scoped and service-role only',()=>{
 const sql=read('supabase/migrations/20260922204000_staff_billing_and_accounting_review.sql');
 assert.match(sql,/permission_key=required\.permission/);
 assert.match(sql,/where id=p_document_id and store_id=p_store_id for update/);
 assert.match(sql,/where id=p_bank_transaction_id and store_id=p_store_id for update/);
 assert.match(sql,/billing\.view','billing\.edit/);
 assert.match(sql,/finance\.view','finance\.edit/);
 assert.match(sql,/insert into public\.ch_staff_activity_audit/g);
 assert.match(sql,/from public,anon,authenticated/g);
 assert.match(sql,/to service_role/g);
 const billing=read('app/api/staff/billing/review/route.ts');
 assert.match(billing,/requireStaffPermission\(context,'billing\.edit',storeId\)/);
 const accounting=read('app/api/staff/accounting/classify/route.ts');
 assert.match(accounting,/requireStaffPermission\(context,'finance\.edit',storeId\)/);
 const revoke=read('supabase/migrations/20260922211000_revoke_legacy_finance_client_mutators.sql');
 assert.match(revoke,/reconcile_bank_transaction/);
 assert.match(revoke,/record_supplier_invoice_payment/);
 assert.match(revoke,/trigger_gmail_finance_reconcile/);
 assert.match(revoke,/revoke execute on function/);
});

test('privileged shipping workers reject anonymous invocation in source',()=>{
 for(const path of ['supabase/functions/dhl-tracking-poller/index.ts','supabase/functions/shipment-sync-worker/index.ts']){
  const src=read(path);
  assert.match(src,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(src,/X-CentralHub-Worker-Secret/);
  assert.match(src,/configuredWorker\.length>=32/);
  assert.match(src,/trustedService/);
  assert.match(src,/status:401/);
 }
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

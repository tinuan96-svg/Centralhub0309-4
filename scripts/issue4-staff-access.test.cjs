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
test('staff cannot enter admin workspace before complete backend authorization',()=>{
  const auth=read('components/AuthProvider.tsx');
  assert.match(auth,/staffPending=user\?\.app_metadata\?\.role==='staff';/);
  assert.match(auth,/staffPending\?<StaffPendingAccess/);
  assert.doesNotMatch(auth,/NEXT_PUBLIC_CENTRALHUB_STAFF_UI_VERIFIED/);
});
test('staff schema remains private and default-deny',()=>{
  const sql=read('supabase/migrations/20260922133000_issue4_staff_rbac_foundation.sql');
  assert.match(sql,/revoke all on table public\.ch_staff_roles/);
  assert.match(sql,/alter table public\.ch_staff_accounts enable row level security/);
  assert.doesNotMatch(sql,/create policy .*staff.* using\s*\(\s*true\s*\)/i);
});
test('privileged cross-store order deletion checks caller and store binding',()=>{
  const route=read('app/api/orders/delete/route.ts');
  assert.match(route,/auth\.getUser\(bearer\.slice\(7\)\)/);
  assert.match(route,/admin\.getUserById\(user\.id\)/);
  assert.match(route,/order\.store_id !== store\.id/);
  const caller=read('lib/services/orderService.ts');
  assert.match(caller,/Authorization: `Bearer \$\{session\.access_token\}`/);
});

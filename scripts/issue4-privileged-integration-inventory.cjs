'use strict';
/* Security inventory of EVERY CentralHub privileged source entrypoint.
 * This is source triage, not an end-to-end authorization certificate.
 * The CI gate fails closed for new staff/admin Next routes missing a guard.
 * Existing Edge workloads are inventoried for manual caller+secret verification.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function walk(dir){
 if(!fs.existsSync(dir))return[];
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
   const f=path.join(dir,entry.name);
   return entry.isDirectory()?walk(f):[f];
 });
}
const isEdge=f=>/^supabase\/functions\/[^/]+\/index\.ts$/.test(f);
const isApi=f=>/^app\/api\/.+\/route\.ts$/.test(f);
const isNetlify=f=>/^netlify\/functions\/.+\.[cm]?[jt]s$/.test(f);
const sources=[...walk('supabase/functions'),...walk('app/api'),...walk('netlify/functions')]
 .map(f=>f.replaceAll(path.sep,'/')).filter(f=>isEdge(f)||isApi(f)||isNetlify(f)).sort();
const credential=/(?:SERVICE_ROLE_KEY|service[_-]?role|auth\.admin\.|createClient\([^)]*(?:secret|privateKey|serviceKey))/i;
const mutates=/(?:\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(|auth\.admin\.|fetch\(|net\.http_post|\.invoke\()/;
const userGuard=/(?:requireVerifiedSuperAdmin|requireStaffContext|requireAdmin\(|authorizeAdmin\(|auth\.getUser\(|auth\.admin\.getUserById\(|is_admin\(|finance_can_manage\()/;
const secretGuard=/(?:verify_[a-z_]*secret|validate_[a-z_]*secret|x-[a-z-]*secret|secureEqual\(|timingSafeEqual|verifySignature|verifyWebhook|trustedService|trustedWorker)/i;
const methodGuard=/(?:req\.method|request\.method|export async function (?:POST|PUT|PATCH|DELETE))/;
const results=sources.map(file=>{
 const code=fs.readFileSync(file,'utf8');
 const elevated=credential.test(code);
 const writes=mutates.test(code);
 const verifiedUser=userGuard.test(code);
 const verifiedSecret=secretGuard.test(code);
 const classification=!elevated&&!writes?'no-obvious-privileged-operation':
   verifiedUser||verifiedSecret?'guard-indicator-present-needs-review':
   'manual-security-review-required';
 return {file,kind:isEdge(file)?'edge':isApi(file)?'api':'netlify',
   elevated_credentials:elevated,mutating_or_external_capabilities:writes,
   user_guard_indicator:verifiedUser,secret_guard_indicator:verifiedSecret,
   method_gate_indicator:methodGuard.test(code),classification};
});
const bad=results.filter(x=>
 (x.file.startsWith('app/api/staff/')&&!x.file.endsWith('access/route.ts')&&!x.file.endsWith('first-login/route.ts')&&!x.file.endsWith('context/route.ts')&&!x.user_guard_indicator)||
 (x.file.startsWith('app/api/admin/')&&!x.user_guard_indicator));
const elevated=results.filter(x=>x.elevated_credentials);
const manual=results.filter(x=>x.classification==='manual-security-review-required');
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/issue4-privileged-integration-inventory.json',
 JSON.stringify({generated_at:new Date().toISOString(),
  note:'Heuristic source inventory only; no production credential, webhook, store isolation or E2E verification implied.',
  totals:{entrypoints:results.length,edge:results.filter(x=>x.kind==='edge').length,
   api:results.filter(x=>x.kind==='api').length,netlify:results.filter(x=>x.kind==='netlify').length,
   elevated_credentials:elevated.length,manual_review_flags:manual.length},
  results},null,2)+'\n');
console.log('Issue #4 privileged entrypoints:',results.length,'Edge:',results.filter(x=>x.kind==='edge').length,
 'API:',results.filter(x=>x.kind==='api').length,'Netlify:',results.filter(x=>x.kind==='netlify').length);
console.log('Service-role indicators:',elevated.length,'Manual review flags:',manual.length);
if(bad.length)console.error('Missing explicit staff/admin route authorization:',bad.map(x=>x.file).join(', '));
assert.equal(bad.length,0,'New staff/admin APIs must have an explicit server-side authorization gate');

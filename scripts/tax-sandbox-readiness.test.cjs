'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/tax/sandbox-readiness.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function loadRegistry() {
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, process: { env: {} } }, { timeout: 1000 });
  return module.exports.getTaxSandboxReadiness;
}
const registry = loadRegistry();
const providers = ['vat', 'paye', 'corporation_tax', 'companies_house'];

test('four distinct tax services are awaiting credentials by default', () => {
  const result = registry({});
  assert.deepEqual(Array.from(result, x => x.id), providers);
  assert.equal(result.every(x => x.status === 'awaiting_credentials' && !x.configured), true);
  assert.equal(result.every(x => x.missing.length > 0), true);
});
test('only full provider-specific credential sets mark a sandbox configured, never tested', () => {
  const env = {
    HMRC_VAT_SANDBOX_CLIENT_ID: 'dummy-id',
    HMRC_VAT_SANDBOX_CLIENT_SECRET: 'dummy-secret',
    CH_SANDBOX_API_KEY: 'dummy-api-key',
  };
  let result = registry(env);
  assert.equal(result.find(x => x.id === 'vat').status, 'credentials_present_untested');
  assert.equal(result.find(x => x.id === 'companies_house').configured, false);
  assert.equal(result.find(x => x.id === 'paye').configured, false);
  assert.equal(result.find(x => x.id === 'corporation_tax').configured, false);
  env.HMRC_VAT_SANDBOX_CLIENT_SECRET = '  ';
  result = registry(env);
  assert.equal(result.find(x => x.id === 'vat').configured, false);
});
test('readiness never serialises values or exposes production or filing routes', () => {
  const env = Object.fromEntries(registry({}).flatMap(p => p.required.map(name => [name, 'SENSITIVE_FAKE_SECRET'])));
  const serialized = JSON.stringify(registry(env));
  assert.equal(serialized.includes('SENSITIVE_FAKE_SECRET'), false);
  assert.equal(registry(env).every(p => p.status === 'credentials_present_untested'), true);
  const route = fs.readFileSync(path.join(root, 'app/api/finance/tax-sandbox/route.ts'), 'utf8');
  assert.match(route, /requireVerifiedSuperAdmin\(request\)/);
  assert.match(route, /https:\/\/test-api\.service\.hmrc\.gov\.uk/);
  assert.match(route, /https:\/\/api-sandbox\.company-information\.service\.gov\.uk/);
  assert.doesNotMatch(route, /https:\/\/api\.service\.hmrc\.gov\.uk/);
  assert.doesNotMatch(route, /https:\/\/api\.company-information\.service\.gov\.uk/);
  assert.doesNotMatch(route, /\b(vat\/returns|CT600-TIL|\/submissions\/|\/transactions\/)/i);
  assert.match(route, /'Cache-Control': 'private, no-store/);
});

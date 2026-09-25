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
const providers = ['vat', 'paye', 'corporation_tax', 'business_rates', 'customs', 'companies_house'];

test('six distinct government services are awaiting credentials by default', () => {
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
  assert.equal(result.find(x => x.id === 'business_rates').configured, false);
  assert.equal(result.find(x => x.id === 'customs').configured, false);
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

test('fixed synthetic samples cover every provider without real records or network', () => {
  const fixtures = fs.readFileSync(path.join(root, 'lib/tax/sandbox-fixtures.ts'), 'utf8');
  const compiledFixtures = ts.transpileModule(fixtures, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiledFixtures, { module, exports: module.exports }, { timeout: 1000 });
  for (const provider of providers) {
    const result = module.exports.runSyntheticSandboxFixture(provider);
    assert.equal(result.provider, provider);
    assert.equal(result.mode, 'local_synthetic_only');
    assert.equal(result.passed, true);
    assert.ok(result.checked >= 2);
    assert.equal(result.cases.every(x => x.passed), true);
    assert.match(result.note, /No HMRC/);
  }
  const route = fs.readFileSync(path.join(root, 'app/api/finance/tax-sandbox/route.ts'), 'utf8');
  assert.match(route, /requireVerifiedSuperAdmin\(request\)/);
  assert.match(route, /Only a fixture provider ID is accepted/);
  assert.match(route, /sandboxOnly: true, liveFilingEnabled: false/);
});

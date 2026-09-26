'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('data client keeps production auth while switching operational data', () => {
  const source = read('lib/supabase.ts');
  assert.match(source, /DEMO_SUPABASE_URL/);
  assert.match(source, /DEMO_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /prop === 'auth'/);
  assert.match(source, /return liveSupabase\.auth/);
  assert.doesNotMatch(source, /service[_-]?role/i);
});

test('demo mode blocks operational API routes but preserves session verification', () => {
  const source = read('proxy.ts');
  assert.match(source, /centralhub_data_mode/);
  assert.match(source, /\/api\/auth\/admin-session/);
  assert.match(source, /\/api\/staff\/access/);
  assert.match(source, /status:\s*423/);
  assert.match(source, /matcher:\s*'\/api\/:path\*'/);
});

test('live background agents and sync do not mount in demo mode', () => {
  const layout = read('components/MobileLayout.tsx');
  const topbar = read('components/Topbar.tsx');
  assert.match(layout, /useDemoMode/);
  assert.match(layout, /!isDemo\s*&&\s*<DhlInvoiceAutoSync/);
  assert.match(layout, /!isDemo\s*&&\s*<CentralHubLiveUpdate/);
  assert.match(layout, /!isDemo\s*&&\s*<>[\s\S]*<CentralHubVoiceAssistant/);
  assert.match(topbar, /if\s*\(!isDemo\)\s*void syncOrders/);
  assert.match(topbar, /if\s*\(isDemo\)/);
});

test('demo mode is visible and reversible', () => {
  const banner = read('components/DemoModeBanner.tsx');
  const topbar = read('components/Topbar.tsx');
  const mobile = read('components/MobileHeader.tsx');
  assert.match(banner, /Sanitised CentralHub Shop data/);
  assert.match(banner, /activateLive/);
  assert.match(topbar, /activateDemo/);
  assert.match(mobile, /activateDemo/);
});

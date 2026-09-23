'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const demo = source('components/demo/DemoDashboardClient.tsx');

test('Public demo reuses the real menu definition without loading authenticated sidebar', () => {
  const real = source('components/ClassifiedSidebar.tsx');
  const nav = source('lib/navigation/sections.ts');
  assert.match(real, /import \{ sections \} from ['"]@\/lib\/navigation\/sections['"]/);
  assert.match(demo, /import \{ sections \} from ['"]@\/lib\/navigation\/sections['"]/);
  assert.match(nav, /export const sections: NavSection\[\]/);
  assert.doesNotMatch(nav, /supabase|fetch\(|AuthService|localStorage|sessionStorage/);
});
test('Demo uses production visual components, not production report loaders', () => {
  const kpi = source('app/dashboard/components/DashboardKpiGrid.tsx');
  const pulse = source('app/dashboard/components/BusinessPulse.tsx');
  assert.match(demo, /<DashboardKpiCards\b/);
  assert.match(demo, /<BusinessPulse\b[^>]*\bdemo\s*\/?\s*>/);
  assert.match(kpi, /export function DashboardKpiCards/);
  assert.match(kpi, /return <DashboardKpiCards/);
  assert.match(pulse, /demo \? 'Demo data/);
  assert.doesNotMatch(demo, /useLiveDashboardReport|DashboardWorkspace|OperationsMonitorProvider/);
});
test('Demo has no production data or auth side effects', () => {
  assert.doesNotMatch(demo, /@\/lib\/supabase|@\/lib\/services\/(?:order|auth|fulfillment)|\bfetch\s*\(|\.from\s*\(|\b(localStorage|sessionStorage)\b|process\.env|window\.location/);
  const shell = source('components/AppRouteShell.tsx');
  assert.match(shell, /pathname === '\/demo'/);
  assert.match(shell, /return <ProtectedAppShell>/);
  assert.match(shell, /return <>\{children\}<\/>/);
  assert.match(demo, /DEMO DATA ONLY/);
  assert.match(demo, /No real orders, payments, courier bookings, messages or database writes/);
});
test('Fold screens have an in-flow non-overlapping sidebar and phone screens retain a drawer', () => {
  assert.match(demo, /width>=700/);
  assert.match(demo, /wide \? 'relative translate-x-0/);
  assert.match(demo, /fixed inset-y-0 left-0 w-\[270px\]/);
  assert.match(demo, /sidebarCollapsed\?'w-\[64px\]':'w-\[270px\]'/);
  assert.match(demo, /!wide&&<nav aria-label="Demo mobile navigation"/);
  assert.match(demo, /id==='menu'\?setNavOpen\(true\)/);
});
test('Sample interactions remain ephemeral and never navigate to a protected route', () => {
  assert.match(demo, /setOrders\(old=>\[order,\.\.\.old\]\)/);
  assert.match(demo, /setProducts\(old=>old\.map\(p=>p\.id===choice\.id/);
  assert.match(demo, /setProducts\(originalProducts\.map/);
  assert.match(demo, /setOrders\(originalOrders\.map/);
  assert.match(demo, /navigateTo\(item\.href,item\.label\)/);
  assert.doesNotMatch(demo, /<Link[^>]*href=\{item\.href\}/);
});

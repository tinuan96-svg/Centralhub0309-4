const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const read=p=>fs.readFileSync(p,'utf8');
test('user can enable or pause dashboard motion without touching live data refresh',()=>{
 const overview=read('app/dashboard/components/DashboardOverview.tsx');
 const transport=read('lib/hooks/useDashboardRealtime.ts');
 const report=read('lib/hooks/useLiveDashboardReport.ts');
 assert.match(overview,/data-motion=\{motionPreference\}/);
 assert.match(overview,/Motion: \{motionPreference/);
 assert.match(overview,/onClick=\{cycleMotionPreference\}/);
 assert.match(overview,/useLiveDashboardReport/);
 assert.match(transport,/DASHBOARD_POLL_MS = 30_000/);
 assert.match(report,/createRefreshQueue/);
});
test('business graph has truthful stationary paid sales and moving overlay only during fresh live checking',()=>{
 const pulse=read('app/dashboard/components/BusinessPulse.tsx');
 const css=read('app/dashboard-theme.css');
 assert.match(pulse,/activity\.buckets\.map/);
 assert.match(pulse,/data-active=\{live \|\| polled\}/);
 assert.match(pulse,/visual sweep only/);
 assert.match(css,/\.ch-live-console \.ch-business-wave\[data-active="true"\] \.ch-business-sweep/);
 assert.match(css,/\.ch-live-console \.ch-business-wave\[data-active="false"\] \.ch-business-sweep/);
 assert.match(css,/ch-business-sweep::after/);
});
test('radar motion does not impersonate fresh telemetry and can run under successful polling',()=>{
 const radar=read('app/dashboard/components/SecurityPulse.tsx'),css=read('app/dashboard-theme.css');
 assert.match(radar,/summary\.rows\.every\(row => row\.score !== null\)/);
 assert.match(radar,/connection === 'live' \|\| connection === 'polling'/);
 assert.match(radar,/data-active=\{radarRunning\}/);
 assert.match(radar,/Stale checks/);
 assert.match(css,/data-motion="on"\] \.ch-radar\[data-active="true"\] \.ch-radar-sweep/);
 assert.match(css,/data-motion="off"\] \.ch-radar \.ch-radar-sweep/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('dashboard motion setting survives refresh, validates storage, and does not overwrite its value on mount',()=>{
 const overview=read('app/dashboard/components/DashboardOverview.tsx');
 assert.match(overview,/const DASHBOARD_MOTION_STORAGE_KEY = 'centralhub:dashboard:motion-preference'/);
 assert.match(overview,/useState<MotionPreference>\('system'\)/);
 assert.match(overview,/window\.localStorage\.getItem\(DASHBOARD_MOTION_STORAGE_KEY\)/);
 assert.match(overview,/isMotionPreference\(stored\)/);
 assert.match(overview,/window\.localStorage\.setItem\(DASHBOARD_MOTION_STORAGE_KEY, next\)/);
 assert.match(overview,/onClick=\{cycleMotionPreference\}/);
 assert.match(overview,/window\.addEventListener\('storage', syncAcrossTabs\)/);
 assert.match(overview,/window\.removeEventListener\('storage', syncAcrossTabs\)/);
 assert.match(overview,/event\.key !== DASHBOARD_MOTION_STORAGE_KEY/);
 assert.match(overview,/value === 'system' \|\| value === 'on' \|\| value === 'off'/);
 // Only the explicit click handler persists the choice, not an effect that
 // would immediately replace an existing choice with the initial "system".
 assert.equal(overview.split('localStorage.setItem(DASHBOARD_MOTION_STORAGE_KEY').length - 1, 1);
 assert.match(overview,/motionPreference === 'system' \? 'on' : motionPreference === 'on' \? 'off' : 'system'/);
 assert.match(overview,/data-motion=\{motionPreference\}/);
 assert.match(overview,/useLiveDashboardReport/);
});

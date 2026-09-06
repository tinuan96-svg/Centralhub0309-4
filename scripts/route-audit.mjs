import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appDir = path.join(root, 'app');
const reportPath = path.join(root, 'route-audit-output.txt');
const sourceDirs = [appDir, path.join(root, 'components'), path.join(root, 'lib')].filter(fs.existsSync);
const routeFiles = new Set();

// These routes represent the continuity-critical business capabilities that have been
// implemented and refined across CentralHub. If a future download/merge silently removes
// one of them, CI must fail before the regression reaches production.
const continuityCriticalRoutes = [
  '/dashboard',
  '/stores',
  '/settings/master-data/stores',
  '/orders',
  '/sync-status',
  '/customers',
  '/inventory',
  '/inventory/visibility',
  '/inventory-management',
  '/inventory-management/stock',
  '/inventory-management/adjustments',
  '/inventory-management/movements',
  '/inventory-management/expiry',
  '/inventory-management/purchase-orders',
  '/inventory-management/grn',
  '/backorder-planning',
  '/suppliers',
  '/suppliers/invoices',
  '/suppliers/pricing',
  '/packing',
  '/shipping',
  '/customer-care/inbox',
  '/customer-care/tickets',
  '/customer-care/channels',
  '/marketing',
  '/marketing/analytics',
  '/marketing/apps',
  '/marketing/apps/releases',
  '/marketing/integrations',
  '/marketing/intelligence',
  '/analytics',
  '/business-intelligence/executive',
  '/business-intelligence/inventory',
  '/business-intelligence/revenue-margin',
  '/business-intelligence/automation',
  '/competitors',
  '/pricing',
  '/pricing/approval',
  '/finance',
  '/banking',
  '/finance/transactions',
  '/finance/payables',
  '/finance/p-and-l',
  '/finance/profitability',
  '/finance/vat',
  '/settings/notifications',
  '/site-health',
];

// These high-value routes must remain discoverable on both desktop and mobile navigation.
const navigationParityRoutes = [
  '/dashboard',
  '/stores',
  '/orders',
  '/sync-status',
  '/inventory',
  '/inventory/visibility',
  '/inventory-management',
  '/inventory-management/expiry',
  '/backorder-planning',
  '/suppliers',
  '/packing',
  '/shipping',
  '/customer-care/inbox',
  '/customer-care/channels',
  '/marketing',
  '/marketing/apps',
  '/marketing/apps/releases',
  '/analytics',
  '/business-intelligence/executive',
  '/banking',
  '/finance/vat',
  '/settings/notifications',
  '/site-health',
];

const navigationParityFiles = [
  path.join(root, 'components', 'ClassifiedSidebar.tsx'),
  path.join(root, 'components', 'MobileHeader.tsx'),
];

const continuityCriticalFiles = [
  'app/marketing/apps/releases/page.tsx',
  'lib/storage/resumableUpload.ts',
  'supabase/functions/app-release-manager/index.ts',
  'supabase/functions/marketing-provider-config/index.ts',
];

const continuityContentAssertions = [
  {
    file: 'app/marketing/apps/releases/page.tsx',
    required: ['uploadReleaseArtifactResumable', 'PUBLISH', 'upload_pending'],
    forbidden: ['.from(bucket)\n        .upload(release.artifact_path'],
  },
  {
    file: 'lib/storage/resumableUpload.ts',
    required: ['/storage/v1/upload/resumable', "'Tus-Resumable'", "method: 'PATCH'", "method: 'HEAD'"],
    forbidden: [],
  },
  {
    file: 'supabase/functions/app-release-manager/index.ts',
    required: ['app-release-artifacts', 'requireAdmin', 'providerConfig', "confirmation !== 'PUBLISH'"],
    forbidden: [],
  },
];

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

walk(appDir, (file) => {
  if (!/^page\.(tsx|ts|jsx|js)$/.test(path.basename(file))) return;
  const rel = path.relative(appDir, path.dirname(file)).replaceAll(path.sep, '/');
  const parts = rel ? rel.split('/') : [];
  const normalized = parts.filter((part) => !/^\([^/]+\)$/.test(part));
  const dynamic = normalized.map((part) => part.startsWith('[') && part.endsWith(']') ? ':dynamic' : part);
  routeFiles.add('/' + dynamic.join('/'));
});

const candidates = new Map();
const patterns = [
  /href\s*=\s*["'`]([^"'`]+)["'`]/g,
  /(?:router\.(?:push|replace|prefetch)|redirect)\(\s*["'`]([^"'`]+)["'`]/g,
];

for (const dir of sourceDirs) {
  walk(dir, (file) => {
    if (!/\.(tsx|ts|jsx|js)$/.test(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const raw = match[1];
        if (!raw?.startsWith('/') || raw.startsWith('//')) continue;
        const route = raw.split(/[?#]/)[0].replace(/\/$/, '') || '/';
        if (route.includes('${') || route.includes('{') || route.includes(':')) continue;
        if (/^\/(api|_next|favicon)/.test(route)) continue;
        if (!candidates.has(route)) candidates.set(route, file);
      }
    }
  });
}

const dynamicRoutes = [...routeFiles].filter((r) => r.includes(':dynamic'));
function exists(route) {
  if (routeFiles.has(route)) return true;
  return dynamicRoutes.some((r) => {
    const a = r.split('/').filter(Boolean);
    const b = route.split('/').filter(Boolean);
    return a.length === b.length && a.every((part, i) => part === ':dynamic' || part === b[i]);
  });
}

const missing = [...candidates.entries()].filter(([route]) => !exists(route)).sort();
const missingCriticalPages = continuityCriticalRoutes.filter((route) => !exists(route));
const missingCriticalFiles = continuityCriticalFiles.filter((file) => !fs.existsSync(path.join(root, file)));

const navigationParityFailures = [];
for (const file of navigationParityFiles) {
  if (!fs.existsSync(file)) {
    navigationParityFailures.push(`${path.relative(root, file)} is missing`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const route of navigationParityRoutes) {
    if (!text.includes(route)) navigationParityFailures.push(`${route} missing from ${path.relative(root, file)}`);
  }
}

const contentAssertionFailures = [];
for (const assertion of continuityContentAssertions) {
  const full = path.join(root, assertion.file);
  if (!fs.existsSync(full)) {
    contentAssertionFailures.push(`${assertion.file} is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  for (const required of assertion.required) {
    if (!text.includes(required)) contentAssertionFailures.push(`${assertion.file} lost required continuity marker: ${required}`);
  }
  for (const forbidden of assertion.forbidden) {
    if (text.includes(forbidden)) contentAssertionFailures.push(`${assertion.file} contains forbidden regression marker: ${forbidden.replaceAll('\n', ' ')}`);
  }
}

const report = [
  `Discovered ${routeFiles.size} App Router pages and ${candidates.size} literal internal navigation targets.`,
  missing.length ? 'Missing frontend routes:' : 'Frontend route integrity: PASS',
  ...missing.map(([route, file]) => `- ${route} <- ${path.relative(root, file)}`),
  missingCriticalPages.length ? 'Continuity-critical pages missing:' : `Continuity-critical pages: PASS (${continuityCriticalRoutes.length} guarded)`,
  ...missingCriticalPages.map((route) => `- ${route}`),
  missingCriticalFiles.length ? 'Continuity-critical implementation files missing:' : `Continuity-critical implementation files: PASS (${continuityCriticalFiles.length} guarded)`,
  ...missingCriticalFiles.map((file) => `- ${file}`),
  contentAssertionFailures.length ? 'Continuity implementation assertions failed:' : 'Continuity implementation assertions: PASS',
  ...contentAssertionFailures.map((failure) => `- ${failure}`),
  navigationParityFailures.length ? 'Desktop/mobile navigation parity failures:' : `Desktop/mobile navigation parity: PASS (${navigationParityRoutes.length} guarded)`,
  ...navigationParityFailures.map((failure) => `- ${failure}`),
].join('\n');

fs.writeFileSync(reportPath, report + '\n');
console.log(report);
if (missing.length || missingCriticalPages.length || missingCriticalFiles.length || contentAssertionFailures.length || navigationParityFailures.length) process.exit(1);

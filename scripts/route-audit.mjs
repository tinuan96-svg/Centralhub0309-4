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
  '/inventory/bulk',
  '/inventory-audit',
  '/inventory-management',
  '/inventory-management/stock',
  '/inventory-management/adjustments',
  '/inventory-management/movements',
  '/inventory-management/reports',
  '/inventory-management/warehouses',
  '/inventory-management/barcode',
  '/inventory-management/packaging',
  '/inventory-management/expiry',
  '/inventory-management/sync',
  '/inventory-management/purchase-orders',
  '/inventory-management/grn',
  '/procurement',
  '/backorder-planning',
  '/suppliers',
  '/suppliers/invoices',
  '/suppliers/pricing',
  '/suppliers/comparison',
  '/picking',
  '/packing',
  '/shipping',
  '/shipping/tracking',
  '/shipping/calculator',
  '/customer-care/inbox',
  '/customer-care/conversations',
  '/customer-care/tickets',
  '/customer-care/channels',
  '/customer-care/ai-assistant',
  '/customer-care/knowledge-base',
  '/customer-care/templates',
  '/customer-care/automations',
  '/marketing',
  '/marketing/campaigns',
  '/marketing/promotions',
  '/marketing/segments',
  '/marketing/calendar',
  '/marketing/whatsapp',
  '/marketing/email',
  '/marketing/social',
  '/marketing/product-feeds',
  '/marketing/tracking',
  '/marketing/audiences',
  '/marketing/creative-library',
  '/marketing/budgets',
  '/marketing/analytics',
  '/marketing/apps',
  '/marketing/apps/releases',
  '/marketing/customer-journey',
  '/marketing/alerts',
  '/marketing/ai',
  '/marketing/integrations',
  '/marketing/settings',
  '/marketing/intelligence',
  '/analytics',
  '/business-intelligence/executive',
  '/business-intelligence/price-opportunities',
  '/business-intelligence/promotion-simulator',
  '/business-intelligence/inventory',
  '/business-intelligence/revenue-margin',
  '/business-intelligence/customers',
  '/business-intelligence/ai-usage',
  '/business-intelligence/automation',
  '/competitors',
  '/pricing',
  '/pricing/approval',
  '/finance',
  '/profit-analysis',
  '/banking',
  '/finance/ledger',
  '/finance/transactions',
  '/finance/mollie',
  '/finance/payables',
  '/expenses',
  '/finance/p-and-l',
  '/finance/profitability',
  '/finance/alerts',
  '/finance/vat',
  '/settings',
  '/settings/notifications',
  '/settings/users',
  '/site-health',
  '/inventory-management/reports/audit',
];

// These high-value routes must remain discoverable on both desktop and mobile navigation.
// Query/hash variants are included here because losing one of those links can silently hide
// a working pricing or approval view even when the underlying page still exists.
const navigationParityRoutes = [
  '/dashboard',
  '/stores',
  '/inventory/visibility',
  '/settings/master-data/stores',
  '/orders',
  '/sync-status',
  '/customers',
  '/inventory',
  '/inventory/bulk',
  '/business-intelligence/executive#approvals',
  '/settings/master-data/categories',
  '/settings/master-data/brands',
  '/inventory-management/sync',
  '/inventory-management',
  '/inventory-management/stock',
  '/inventory-management/adjustments',
  '/inventory-management/movements',
  '/inventory-audit',
  '/inventory-management/reports',
  '/inventory-management/warehouses',
  '/inventory-management/barcode',
  '/inventory-management/packaging',
  '/inventory-management/expiry',
  '/procurement',
  '/backorder-planning',
  '/inventory-management/purchase-orders',
  '/suppliers/invoices',
  '/inventory-management/grn',
  '/suppliers',
  '/suppliers/pricing',
  '/suppliers/comparison',
  '/picking',
  '/packing',
  '/shipping',
  '/shipping/tracking',
  '/shipping/calculator',
  '/customer-care/inbox',
  '/customer-care/conversations',
  '/customer-care/tickets',
  '/customer-care/channels',
  '/customer-care/ai-assistant',
  '/customer-care/knowledge-base',
  '/customer-care/templates',
  '/customer-care/automations',
  '/marketing',
  '/marketing/campaigns',
  '/marketing/promotions',
  '/marketing/segments',
  '/marketing/calendar',
  '/marketing/whatsapp',
  '/marketing/email',
  '/marketing/social',
  '/marketing/product-feeds',
  '/marketing/tracking',
  '/marketing/audiences',
  '/marketing/creative-library',
  '/marketing/budgets',
  '/marketing/analytics',
  '/marketing/apps',
  '/marketing/apps/releases',
  '/marketing/customer-journey',
  '/marketing/alerts',
  '/marketing/ai',
  '/marketing/integrations',
  '/marketing/settings',
  '/analytics',
  '/business-intelligence/executive',
  '/business-intelligence/price-opportunities',
  '/business-intelligence/promotion-simulator',
  '/business-intelligence/inventory',
  '/business-intelligence/revenue-margin',
  '/business-intelligence/customers',
  '/marketing/intelligence',
  '/business-intelligence/ai-usage',
  '/business-intelligence/automation',
  '/competitors',
  '/pricing',
  '/pricing/approval',
  '/pricing?tab=fixing',
  '/pricing?tab=weekly',
  '/pricing?tab=competitors',
  '/pricing?tab=rules',
  '/pricing?tab=history',
  '/finance',
  '/profit-analysis',
  '/banking',
  '/finance/ledger',
  '/finance/transactions',
  '/finance/mollie',
  '/finance/payables',
  '/expenses',
  '/finance/p-and-l',
  '/finance/profitability',
  '/finance/alerts',
  '/finance/vat',
  '/settings',
  '/settings/notifications',
  '/site-health',
  '/settings/users',
  '/inventory-management/reports/audit',
];

const navigationParityFiles = [
  path.join(root, 'components', 'ClassifiedSidebar.tsx'),
  path.join(root, 'components', 'MobileHeader.tsx'),
];

const standaloneAnalyticsMarkers = [
  { file: 'components/ClassifiedSidebar.tsx', markers: ["key: '07-analytics'", "label: 'Analytics'", "href: '/analytics', label: 'Analytics Overview'"] },
  { file: 'components/MobileHeader.tsx', markers: ["key: '10.5 — analytics'", "label: 'Analytics'", "href: '/analytics', label: 'Analytics Overview'"] },
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
const navigationTexts = new Map();
for (const file of navigationParityFiles) {
  if (!fs.existsSync(file)) {
    navigationParityFailures.push(`${path.relative(root, file)} is missing`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  navigationTexts.set(file, text);
  for (const route of navigationParityRoutes) {
    if (!text.includes(route)) navigationParityFailures.push(`${route} missing from ${path.relative(root, file)}`);
  }
}

// Beyond the critical route list, compare every literal href in the two navigation catalogs.
// This catches the exact regression that previously hid Analytics and other working pages.
if (navigationParityFiles.every((file) => navigationTexts.has(file))) {
  const hrefPattern = /href:\s*["'`]([^"'`]+)["'`]/g;
  const catalogs = navigationParityFiles.map((file) => {
    const targets = new Set();
    for (const match of navigationTexts.get(file).matchAll(hrefPattern)) {
      if (match[1]?.startsWith('/')) targets.add(match[1]);
    }
    return { file, targets };
  });
  const [desktop, mobile] = catalogs;
  for (const target of desktop.targets) {
    if (!mobile.targets.has(target)) navigationParityFailures.push(`${target} exists in desktop navigation but is missing from mobile/Fold navigation`);
  }
  for (const target of mobile.targets) {
    if (!desktop.targets.has(target)) navigationParityFailures.push(`${target} exists in mobile/Fold navigation but is missing from desktop navigation`);
  }
}

for (const assertion of standaloneAnalyticsMarkers) {
  const full = path.join(root, assertion.file);
  if (!fs.existsSync(full)) {
    navigationParityFailures.push(`${assertion.file} is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  for (const marker of assertion.markers) {
    if (!text.includes(marker)) navigationParityFailures.push(`Standalone Analytics section marker missing from ${assertion.file}: ${marker}`);
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
  navigationParityFailures.length ? 'Desktop/mobile navigation parity failures:' : `Desktop/mobile navigation parity: PASS (${navigationParityRoutes.length} guarded + full catalog comparison)`,
  ...navigationParityFailures.map((failure) => `- ${failure}`),
].join('\n');

fs.writeFileSync(reportPath, report + '\n');
console.log(report);
if (missing.length || missingCriticalPages.length || missingCriticalFiles.length || contentAssertionFailures.length || navigationParityFailures.length) process.exit(1);

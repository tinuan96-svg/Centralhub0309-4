import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appDir = path.join(root, 'app');
const reportPath = path.join(root, 'route-audit-output.txt');
const sourceDirs = [appDir, path.join(root, 'components'), path.join(root, 'lib')].filter(fs.existsSync);
const routeFiles = new Set();
const continuityCriticalRoutes = [
  '/analytics',
  '/site-health',
  '/finance/vat',
  '/settings/notifications',
  '/marketing/apps',
  '/marketing/apps/releases',
  '/inventory/visibility',
  '/settings/master-data/stores',
];
const navigationParityFiles = [
  path.join(root, 'components', 'ClassifiedSidebar.tsx'),
  path.join(root, 'components', 'MobileHeader.tsx'),
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
const navigationParityFailures = [];
for (const file of navigationParityFiles) {
  if (!fs.existsSync(file)) {
    navigationParityFailures.push(`${path.relative(root, file)} is missing`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const route of continuityCriticalRoutes) {
    if (!text.includes(route)) navigationParityFailures.push(`${route} missing from ${path.relative(root, file)}`);
  }
}

const report = [
  `Discovered ${routeFiles.size} App Router pages and ${candidates.size} literal internal navigation targets.`,
  missing.length ? 'Missing frontend routes:' : 'Frontend route integrity: PASS',
  ...missing.map(([route, file]) => `- ${route} <- ${path.relative(root, file)}`),
  missingCriticalPages.length ? 'Continuity-critical pages missing:' : 'Continuity-critical pages: PASS',
  ...missingCriticalPages.map((route) => `- ${route}`),
  navigationParityFailures.length ? 'Desktop/mobile navigation parity failures:' : 'Desktop/mobile navigation parity: PASS',
  ...navigationParityFailures.map((failure) => `- ${failure}`),
].join('\n');
fs.writeFileSync(reportPath, report + '\n');
console.log(report);
if (missing.length || missingCriticalPages.length || navigationParityFailures.length) process.exit(1);

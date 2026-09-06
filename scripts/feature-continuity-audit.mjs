import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'app/analytics/page.tsx',
  'app/backorder-planning/page.tsx',
  'app/banking/page.tsx',
  'app/business-intelligence/page.tsx',
  'app/competitors/page.tsx',
  'app/customer-care/page.tsx',
  'app/dashboard/page.tsx',
  'app/finance/vat/page.tsx',
  'app/inventory-management/expiry/page.tsx',
  'app/inventory-management/expiry/ExpiryClient.tsx',
  'app/inventory/visibility/page.tsx',
  'app/marketing/apps/page.tsx',
  'app/marketing/apps/releases/page.tsx',
  'app/orders/page.tsx',
  'app/settings/master-data/stores/page.tsx',
  'app/settings/notifications/page.tsx',
  'components/MobileLayout.tsx',
  'components/MobileHeader.tsx',
  'components/MobileBottomNav.tsx',
  'app/fold-mobile-fixes.css',
  'public/sw.js',
  'lib/services/orderService.ts',
  'lib/services/pushNotificationService.ts',
  'lib/server/webPush.ts',
  'lib/storage/resumableUpload.ts',
  'app/api/push/subscribe/route.ts',
  'app/api/push/send/route.ts',
  'app/api/push/test/route.ts',
  'supabase/functions/app-release-manager/index.ts',
  'supabase/functions/marketing-provider-config/index.ts',
  'supabase/migrations/20260906185000_add_pwa_push_subscriptions.sql',
];

const contentChecks = [
  {
    label: 'Samsung Fold mobile shell remains active through tablet-width Fold screens',
    file: 'components/MobileLayout.tsx',
    includes: ["(max-width: 1023px)", 'MobileLayout'],
  },
  {
    label: 'Samsung Fold overlay visibility override is loaded globally',
    file: 'app/layout.tsx',
    includes: ["./fold-mobile-fixes.css"],
  },
  {
    label: 'Samsung Fold hidden overlay override covers 700px to 1023px',
    file: 'app/fold-mobile-fixes.css',
    includes: ['min-width: 700px', 'max-width: 1023px', 'display: flex !important'],
  },
  {
    label: 'PWA service worker handles Android push messages and notification taps',
    file: 'public/sw.js',
    includes: ["addEventListener('push'", "addEventListener('notificationclick'", 'showNotification'],
  },
  {
    label: 'Notification settings page exposes phone alert setup and test controls',
    file: 'app/settings/notifications/page.tsx',
    includes: ['PushNotificationService', 'Enable phone alerts', 'Send test', 'NEXT_PUBLIC_CENTRALHUB_VAPID_PUBLIC_KEY'],
  },
  {
    label: 'Client push service registers service worker and saves PushManager subscriptions',
    file: 'lib/services/pushNotificationService.ts',
    includes: ['PushManager', 'Notification', '/api/push/subscribe', '/api/push/test'],
  },
  {
    label: 'Server push sender supports VAPID Web Push without storing secrets in GitHub',
    file: 'lib/server/webPush.ts',
    includes: ['CENTRALHUB_VAPID_PRIVATE_KEY', 'sendWebPush', 'aes128gcm'],
  },
  {
    label: 'Push subscription API enforces logged-in Supabase user ownership',
    file: 'app/api/push/subscribe/route.ts',
    includes: ['getUserFromRequest', 'push_subscriptions', 'user.id'],
  },
  {
    label: 'Internal push send API requires a shared secret before sending alerts',
    file: 'app/api/push/send/route.ts',
    includes: ['CENTRALHUB_PUSH_API_SECRET', 'system_notifications', 'sendWebPush'],
  },
  {
    label: 'Phone push test API inserts a system notification and sends to saved devices',
    file: 'app/api/push/test/route.ts',
    includes: ['phone_push_test', 'push_subscriptions', 'sendWebPush'],
  },
  {
    label: 'Order service still invokes CentralHub sync-orders Edge Function',
    file: 'lib/services/orderService.ts',
    includes: ["functions.invoke('sync-orders'", 'syncOrderFromSource'],
  },
  {
    label: 'Expiry management remains wired to central inventory and permanent expiry write-off history',
    file: 'app/inventory-management/expiry/ExpiryClient.tsx',
    includes: ['central_inventory', 'inventory_expiry_writeoffs', 'historicalWriteoffValue', 'Recorded Expiry Losses'],
  },
  {
    label: 'App Release Manager uses resilient resumable upload rather than a one-shot storage upload',
    file: 'app/marketing/apps/releases/page.tsx',
    includes: ['uploadReleaseArtifactResumable', 'upload_pending', 'PUBLISH', 'resumable 6 MB chunks'],
  },
  {
    label: 'Resumable release uploader keeps TUS create, resume, chunk and retry behaviour',
    file: 'lib/storage/resumableUpload.ts',
    includes: ['/storage/v1/upload/resumable', "'Tus-Resumable'", "method: 'HEAD'", "method: 'PATCH'", 'RETRY_DELAYS', 'localStorage'],
  },
  {
    label: 'Release backend remains admin-gated and production publishing requires explicit confirmation',
    file: 'supabase/functions/app-release-manager/index.ts',
    includes: ['requireAdmin', 'app-release-artifacts', "confirmation !== 'PUBLISH'", 'marketing_provider_configs'],
  },
  {
    label: 'Provider credential manager remains encrypted and admin-gated',
    file: 'supabase/functions/marketing-provider-config/index.ts',
    includes: ['requireAdmin', 'MARKETING_TOKEN_ENCRYPTION_KEY', 'AES-GCM', 'marketing_provider_configs'],
  },
  {
    label: 'Route audit guards continuity-critical pages in both desktop and mobile navigation',
    file: 'scripts/route-audit.mjs',
    includes: ['/analytics', '/site-health', '/finance/vat', '/settings/notifications', '/marketing/apps/releases', '/inventory/visibility', '/inventory-management/expiry', '/orders', '/suppliers', '/pricing'],
  },
  {
    label: 'PWA push subscription migration is tracked in source control',
    file: 'supabase/migrations/20260906185000_add_pwa_push_subscriptions.sql',
    includes: ['push_subscriptions', 'enable row level security', 'Users can insert their push subscriptions'],
  },
];

const forbiddenChecks = [
  {
    label: 'App Release Manager must not regress to one-shot Supabase upload',
    file: 'app/marketing/apps/releases/page.tsx',
    excludes: ['.upload(release.artifact_path'],
  },
  {
    label: 'Release uploader must not persist long-lived provider secrets',
    file: 'lib/storage/resumableUpload.ts',
    excludes: ['service_account_json', 'private_key', 'MARKETING_TOKEN_ENCRYPTION_KEY'],
  },
];

const failures = [];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required feature file: ${file}`);
}

for (const check of contentChecks) {
  if (!exists(check.file)) {
    failures.push(`${check.label}: ${check.file} is missing`);
    continue;
  }
  const text = read(check.file);
  for (const expected of check.includes) {
    if (!text.includes(expected)) failures.push(`${check.label}: ${check.file} does not contain ${JSON.stringify(expected)}`);
  }
}

for (const check of forbiddenChecks) {
  if (!exists(check.file)) {
    failures.push(`${check.label}: ${check.file} is missing`);
    continue;
  }
  const text = read(check.file);
  for (const forbidden of check.excludes) {
    if (text.includes(forbidden)) failures.push(`${check.label}: ${check.file} contains forbidden regression marker ${JSON.stringify(forbidden)}`);
  }
}

const report = [
  `CentralHub feature continuity audit checked ${requiredFiles.length} files, ${contentChecks.length} behaviour markers and ${forbiddenChecks.length} regression bans.`,
  failures.length ? 'Feature continuity audit: FAIL' : 'Feature continuity audit: PASS',
  ...failures.map((failure) => `- ${failure}`),
].join('\n');

fs.writeFileSync(path.join(root, 'feature-continuity-audit-output.txt'), report + '\n');
console.log(report);

if (failures.length) process.exit(1);

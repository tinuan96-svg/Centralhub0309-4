import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'feature-continuity-audit-output.txt');
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

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
  'app/marketing/integrations/page.tsx',
  'app/marketing/integrations/MarketingIntegrationsClient.tsx',
  'app/orders/page.tsx',
  'app/orders/OrdersClient.tsx',
  'app/settings/master-data/stores/page.tsx',
  'app/settings/notifications/page.tsx',
  'app/site-health/page.tsx',
  'components/MarketingConnectionModal.tsx',
  'components/MobileLayout.tsx',
  'components/MobileHeader.tsx',
  'components/MobileBottomNav.tsx',
  'app/fold-mobile-fixes.css',
  'app/layout.tsx',
  'public/sw.js',
  'lib/hooks/useOrderActions.ts',
  'lib/services/orderService.ts',
  'lib/services/marketing/marketingService.ts',
  'lib/services/pushNotificationService.ts',
  'lib/server/webPush.ts',
  'lib/storage/resumableUpload.ts',
  'app/api/push/subscribe/route.ts',
  'app/api/push/send/route.ts',
  'app/api/push/test/route.ts',
  'supabase/functions/app-release-manager/index.ts',
  'supabase/functions/marketing-provider-config/index.ts',
  'supabase/functions/sync-orders/index.ts',
  'supabase/functions/update-order-status/index.ts',
  'supabase/functions/site-health-worker/index.ts',
  'supabase/functions/site-health-readiness/index.ts',
  'supabase/functions/site-health-deploy-verifier/index.ts',
  'supabase/migrations/20260906185000_add_pwa_push_subscriptions.sql',
];

const assertions = [
  { label: 'Samsung Fold mobile shell stays active through Fold inner-width screens', file: 'components/MobileLayout.tsx', all: ['(max-width: 1023px)', 'MobileLayout'] },
  { label: 'Samsung Fold overlay fix is globally loaded', file: 'app/layout.tsx', all: ['./fold-mobile-fixes.css'] },
  { label: 'Samsung Fold overlay fix keeps overlays visible from 700px to 1023px', file: 'app/fold-mobile-fixes.css', all: ['min-width: 700px', 'max-width: 1023px', 'display: flex !important'] },
  { label: 'Android/PWA service worker can show and route push notifications', file: 'public/sw.js', all: ["addEventListener('push'", "addEventListener('notificationclick'", 'showNotification'] },
  { label: 'Notification settings page exposes phone push setup and testing', file: 'app/settings/notifications/page.tsx', all: ['PushNotificationService', 'Enable phone alerts', 'Send test'], any: ['NEXT_PUBLIC_CENTRALHUB_VAPID_PUBLIC_KEY', 'VAPID public key'] },
  { label: 'Client push service saves PushManager subscriptions through protected API routes', file: 'lib/services/pushNotificationService.ts', all: ['PushManager', 'Notification', '/api/push/subscribe', '/api/push/test', 'Bearer'] },
  { label: 'Server Web Push sender keeps VAPID/aes128gcm support', file: 'lib/server/webPush.ts', all: ['CENTRALHUB_VAPID_PRIVATE_KEY', 'sendWebPush', 'aes128gcm'] },
  { label: 'Push subscription endpoint remains user-scoped', file: 'app/api/push/subscribe/route.ts', all: ['getUserFromRequest', 'push_subscriptions', 'user.id', 'upsert'] },
  { label: 'Internal push sender remains secret-protected', file: 'app/api/push/send/route.ts', all: ['CENTRALHUB_PUSH_API_SECRET', 'system_notifications', 'sendWebPush'] },
  { label: 'Phone push test creates an in-app notification and sends to saved devices', file: 'app/api/push/test/route.ts', all: ['phone_push_test', 'push_subscriptions', 'sendWebPush'] },
  { label: 'Order service still delegates source refreshes to sync-orders Edge Function', file: 'lib/services/orderService.ts', all: ["functions.invoke('sync-orders'", 'syncOrderFromSource'] },
  { label: 'Order actions still sync source status updates/refunds', file: 'lib/hooks/useOrderActions.ts', all: ["functions.invoke('update-order-status'", 'Source-store refund sync failed'] },
  { label: 'Orders page keeps operational workflow and background sync affordances', file: 'app/orders/OrdersClient.tsx', all: ['pending_payment', 'ready_to_ship', 'setInterval'], any: ["functions.invoke('sync-orders'", 'syncOrderFromSource'] },
  { label: 'Four-store inbound order sync preserves targeted sync and mismatch reporting', file: 'supabase/functions/sync-orders/index.ts', all: ['tamilretail', 'storeSlug is required when orderId is supplied', 'mismatched_count', 'partial_success'], any: ['signedTamilRequest("pull"', 'signed_gateway', 'direct_service_role'] },
  { label: 'Outbound status sync supports store push and records sync state', file: 'supabase/functions/update-order-status/index.ts', all: ['markSync("synced")', 'markSync("failed"', 'paymentStatus: order.payment_status'], any: ['signedTamilRequest("update_status"', 'signed_gateway', 'direct_service_role', 'Remote credentials are not configured'] },
  { label: 'Expiry page still calculates exposure and permanent write-off trend', file: 'app/inventory-management/expiry/ExpiryClient.tsx', all: ['central_inventory', 'inventory_expiry_writeoffs', 'historicalWriteoffValue', 'Recorded Expiry Losses'] },
  { label: 'Marketing integrations stay store-scoped and avoid fake connected states', file: 'app/marketing/integrations/MarketingIntegrationsClient.tsx', all: ['MarketingConnectionModal'], any: ['Available does not mean connected', 'No Stores Connected', 'Coming Soon', 'Select one store'] },
  { label: 'Marketing connection modal stores credentials server-side', file: 'components/MarketingConnectionModal.tsx', all: ['configureStoreProvider'], any: ['Credentials are handled server-side', 'OAuth state is bound', 'No fake connection'] },
  { label: 'Marketing service uses store-scoped provider configs and real sync functions', file: 'lib/services/marketing/marketingService.ts', all: ['marketing_provider_configs'], any: ['google-marketing-oauth', 'marketing-oauth', 'marketing-sync', 'google-analytics-sync'] },
  { label: 'App Release Manager keeps resumable upload and manual publishing', file: 'app/marketing/apps/releases/page.tsx', all: ['uploadReleaseArtifactResumable', 'upload_pending', 'PUBLISH'], any: ['resumable 6 MB chunks', 'resumable upload'] },
  { label: 'Resumable uploader keeps TUS create/resume/chunk/retry behaviour', file: 'lib/storage/resumableUpload.ts', all: ['/storage/v1/upload/resumable', 'Tus-Resumable', "method: 'HEAD'", "method: 'PATCH'", 'RETRY_DELAYS', 'localStorage'] },
  { label: 'Release backend remains admin-gated and manual-publish protected', file: 'supabase/functions/app-release-manager/index.ts', all: ['requireAdmin', 'app-release-artifacts', "confirmation !== 'PUBLISH'", 'marketing_provider_configs'] },
  { label: 'Provider credential manager remains encrypted and admin-gated', file: 'supabase/functions/marketing-provider-config/index.ts', all: ['requireAdmin', 'MARKETING_TOKEN_ENCRYPTION_KEY', 'AES-GCM', 'marketing_provider_configs'] },
  { label: 'Site Health page keeps store isolation, kill switch and automation controls', file: 'app/site-health/page.tsx', all: ['Auto Site Health', 'kill_switch', 'execution_mode', 'SiteGuru', 'Search Console'] },
  { label: 'Site Health worker blocks risky paths and verifies GitHub before repairs', file: 'supabase/functions/site-health-worker/index.ts', all: ['verifyGithub', 'isForbiddenPath', 'centralhub-site-health'], any: ['payment', 'orders', 'createRemoteJWKSet'] },
  { label: 'Site Health readiness reports external dependencies without exposing secrets', file: 'supabase/functions/site-health-readiness/index.ts', all: ['centralhub_supabase'], any: ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'NETLIFY_AUTH_TOKEN'] },
  { label: 'Site Health deploy verifier checks deploy ancestry and live HTTP', file: 'supabase/functions/site-health-deploy-verifier/index.ts', all: ['production_verified'], any: ['githubContains', 'findNetlifySite', 'live_http_status', 'verify_site_health_deploy_worker_secret'] },
  { label: 'Route audit protects CentralHub continuity-critical navigation', file: 'scripts/route-audit.mjs', all: ['/dashboard', '/orders', '/inventory-management/expiry', '/marketing/apps/releases', '/finance/vat', '/settings/notifications', '/site-health'] },
  { label: 'Push subscription migration keeps RLS and self-owned subscription policies', file: 'supabase/migrations/20260906185000_add_pwa_push_subscriptions.sql', all: ['push_subscriptions', 'enable row level security', 'Users can insert their push subscriptions'] },
];

const forbidden = [
  { label: 'Release page must not regress to direct one-shot Supabase Storage upload', file: 'app/marketing/apps/releases/page.tsx', tokens: ['.from(bucket)\n        .upload(release.artifact_path'] },
  { label: 'Browser resumable uploader must not embed provider secrets', file: 'lib/storage/resumableUpload.ts', tokens: ['service_account_json', 'private_key', 'MARKETING_TOKEN_ENCRYPTION_KEY'] },
];

const failures = [];
const passes = [];

for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required feature file: ${file}`);
}

for (const assertion of assertions) {
  if (!exists(assertion.file)) {
    failures.push(`${assertion.label}: ${assertion.file} is missing`);
    continue;
  }
  const text = read(assertion.file);
  const missingAll = (assertion.all || []).filter((token) => !text.includes(token));
  const anyOk = !assertion.any || assertion.any.some((token) => text.includes(token));
  if (missingAll.length || !anyOk) {
    if (missingAll.length) failures.push(`${assertion.label}: missing ${missingAll.map((x) => JSON.stringify(x)).join(', ')}`);
    if (!anyOk) failures.push(`${assertion.label}: none of the accepted alternatives were found: ${assertion.any.map((x) => JSON.stringify(x)).join(', ')}`);
  } else {
    passes.push(assertion.label);
  }
}

for (const assertion of forbidden) {
  if (!exists(assertion.file)) continue;
  const text = read(assertion.file);
  for (const token of assertion.tokens) {
    if (text.includes(token)) failures.push(`${assertion.label}: forbidden token found ${JSON.stringify(token)}`);
  }
}

const report = [
  `CentralHub feature continuity audit checked ${requiredFiles.length} files, ${assertions.length} behaviour groups and ${forbidden.length} regression bans.`,
  `Passed groups: ${passes.length}`,
  failures.length ? 'Feature continuity audit: FAIL' : 'Feature continuity audit: PASS',
  ...failures.map((failure) => `- ${failure}`),
].join('\n');

fs.writeFileSync(reportPath, report + '\n');
console.log(report);

if (failures.length) process.exit(1);

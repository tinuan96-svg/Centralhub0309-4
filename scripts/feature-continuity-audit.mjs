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
  'app/marketing/integrations/page.tsx',
  'app/marketing/integrations/MarketingIntegrationsClient.tsx',
  'app/orders/page.tsx',
  'app/settings/master-data/stores/page.tsx',
  'app/settings/notifications/page.tsx',
  'app/site-health/page.tsx',
  'components/MarketingConnectionModal.tsx',
  'components/MobileLayout.tsx',
  'components/MobileHeader.tsx',
  'components/MobileBottomNav.tsx',
  'app/fold-mobile-fixes.css',
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
    label: 'Order service still invokes CentralHub sync-orders and update-order-status Edge Functions',
    file: 'lib/services/orderService.ts',
    includes: ["functions.invoke('sync-orders'", 'syncOrderFromSource', "functions.invoke('update-order-status'"],
  },
  {
    label: 'Refund actions sync refunded status back to the source store instead of only CentralHub',
    file: 'lib/hooks/useOrderActions.ts',
    includes: ["status: 'refunded'", "functions.invoke('update-order-status'", 'Source-store refund sync failed'],
  },
  {
    label: 'Orders page keeps the full operational status workflow and background sync',
    file: 'app/orders/OrdersClient.tsx',
    includes: ['pending_payment', 'ready_to_ship', 'out_for_delivery', "functions.invoke('sync-orders'", 'setInterval'],
  },
  {
    label: 'Four-store inbound order sync preserves targeted sync, Tamil signed gateway and mismatch reporting',
    file: 'supabase/functions/sync-orders/index.ts',
    includes: ['tamilretail', 'signedTamilRequest("pull"', 'storeSlug is required when orderId is supplied', 'mismatched_count', 'partial_success', 'direct_service_role', 'signed_gateway'],
  },
  {
    label: 'Outbound status sync supports all stores, records sync state and uses Tamil signed gateway',
    file: 'supabase/functions/update-order-status/index.ts',
    includes: ['signedTamilRequest("update_status"', 'markSync("synced")', 'markSync("failed"', 'Remote credentials are not configured', 'paymentStatus: order.payment_status', 'direct_service_role', 'signed_gateway'],
  },
  {
    label: 'Expiry management remains wired to central inventory and permanent expiry write-off history',
    file: 'app/inventory-management/expiry/ExpiryClient.tsx',
    includes: ['central_inventory', 'inventory_expiry_writeoffs', 'historicalWriteoffValue', 'Recorded Expiry Losses'],
  },
  {
    label: 'Marketing integrations remain store-scoped and do not show fake connected states',
    file: 'app/marketing/integrations/MarketingIntegrationsClient.tsx',
    includes: ['Available does not mean connected', 'Select one store before connecting', 'MarketingConnectionModal', 'No Stores Connected', 'Coming Soon'],
  },
  {
    label: 'Marketing connection modal stores credentials server-side and starts real OAuth only after store credentials are entered',
    file: 'components/MarketingConnectionModal.tsx',
    includes: ['configureStoreProvider', 'startOAuth', 'Credentials are handled server-side', 'OAuth state is bound to this selected store', 'No fake connection will be created'],
  },
  {
    label: 'Marketing service uses store-scoped provider configs and real OAuth/sync Edge Functions',
    file: 'lib/services/marketing/marketingService.ts',
    includes: ['marketing_provider_configs', 'google-marketing-oauth', 'marketing-oauth', 'marketing-sync', 'google-analytics-sync'],
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
    label: 'Site Health page keeps store isolation, kill switch and guarded automation controls visible',
    file: 'app/site-health/page.tsx',
    includes: ['Auto Site Health', 'kill_switch', 'execution_mode', 'SiteGuru', 'Search Console', 'Rollback guard'],
  },
  {
    label: 'Site Health worker blocks dangerous paths and verifies GitHub OIDC before AI repair work',
    file: 'supabase/functions/site-health-worker/index.ts',
    includes: ['verifyGithub', 'isForbiddenPath', 'payment', 'orders', 'centralhub-site-health', 'createRemoteJWKSet'],
  },
  {
    label: 'Site Health readiness reports external dependency availability without exposing secrets',
    file: 'supabase/functions/site-health-readiness/index.ts',
    includes: ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'NETLIFY_AUTH_TOKEN', 'centralhub_supabase'],
  },
  {
    label: 'Site Health deploy verifier checks Netlify deployment ancestry and live HTTP before marking verified',
    file: 'supabase/functions/site-health-deploy-verifier/index.ts',
    includes: ['githubContains', 'findNetlifySite', 'production_verified', 'live_http_status', 'verify_site_health_deploy_worker_secret'],
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

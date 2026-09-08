#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const required = [
  'lib/services/orderSyncClient.ts',
  'app/api/sync-orders/route.ts',
  'supabase/functions/sync-orders/index.ts',
];

for (const file of required) {
  try {
    readFileSync(file, 'utf8');
  } catch {
    console.error(`Missing order-sync contract file: ${file}`);
    process.exit(1);
  }
}

const browserFiles = [
  'app/orders/OrdersClient.tsx',
  'components/Topbar.tsx',
  'components/AppLayout.tsx',
  'app/sync-status/SyncStatusClient.tsx',
  'lib/services/orderService.ts',
];

const forbidden = /supabase\.functions\.invoke\(\s*['"]sync-orders['"]/;
const violations = browserFiles.filter((file) => forbidden.test(readFileSync(file, 'utf8')));

if (violations.length) {
  console.error('Direct browser sync-orders calls found:');
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

const client = readFileSync('lib/services/orderSyncClient.ts', 'utf8');
if (!client.includes("fetch('/api/sync-orders'")) {
  console.error('Canonical client does not use /api/sync-orders.');
  process.exit(1);
}

console.log('Order-sync contract audit passed.');

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const appDir = path.join(root, 'app');
const port = Number(process.env.SMOKE_PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

const routes = new Set();
walk(appDir, (file) => {
  if (!/^page\.(tsx|ts|jsx|js)$/.test(path.basename(file))) return;
  const rel = path.relative(appDir, path.dirname(file)).replaceAll(path.sep, '/');
  if (!rel || rel.split('/').some((part) => part.startsWith('['))) return;
  const normalized = rel.split('/').filter((part) => !/^\([^/]+\)$/.test(part));
  routes.add('/' + normalized.join('/'));
});

if (!routes.size) {
  console.error('Route smoke audit: no static App Router pages discovered.');
  process.exit(1);
}

const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => { output += chunk.toString(); });
server.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next production server did not become ready.\n${output}`);
}

try {
  await waitForServer();
  const failures = [];
  for (const route of [...routes].sort()) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    if (response.status === 404 || response.status >= 500) {
      failures.push(`${route} -> HTTP ${response.status}`);
    }
  }

  console.log(`Route smoke audit: checked ${routes.size} static frontend routes.`);
  if (failures.length) {
    console.error('Frontend route smoke failures:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('Frontend route smoke: PASS');
  }
} finally {
  server.kill('SIGTERM');
}

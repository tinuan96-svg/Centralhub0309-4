import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const config = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8');
const expectedNext = '16.3.4';
const failures = [];

if (pkg.dependencies?.next !== expectedNext) {
  failures.push(`Next.js must remain pinned to ${expectedNext} for Bolt/WebContainer compatibility.`);
}

if (pkg.devDependencies?.['eslint-config-next'] !== expectedNext) {
  failures.push(`eslint-config-next must match Next.js ${expectedNext}.`);
}

if (pkg.scripts?.dev !== 'next dev') {
  failures.push('The development command must run the pinned Next.js dependency directly.');
}

if (pkg.scripts?.postinstall) {
  failures.push('Runtime compatibility must not depend on patching installed Next.js files.');
}

if (config.includes('staticGenerationRetryCount')) {
  failures.push('staticGenerationRetryCount must remain disabled for the Bolt/WebContainer runtime.');
}

if (failures.length) {
  console.error('Runtime compatibility audit: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Runtime compatibility audit: PASS (Next.js ${expectedNext}).`);

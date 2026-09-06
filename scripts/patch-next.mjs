import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WEBCONTAINER_MARKER = 'CENTRALHUB_WEBCONTAINER_ALS_COMPAT';

function replaceInvariantCalls(source, replacement) {
  let replacements = 0;

  source = source.replace(
    /\(\s*0\s*,\s*[A-Za-z_$][\w$]*\.throwInvariantForMissingStore\s*\)\s*\(\s*\)\s*;/g,
    () => {
      replacements += 1;
      return replacement;
    },
  );

  source = source.replace(/\bthrowInvariantForMissingStore\s*\(\s*\)\s*;/g, () => {
    replacements += 1;
    return replacement;
  });

  return { source, replacements };
}

function patchFile(filePath, replacement) {
  if (!existsSync(filePath)) return { filePath, status: 'missing', replacements: 0 };

  const original = readFileSync(filePath, 'utf8');
  if (original.includes(WEBCONTAINER_MARKER)) {
    return { filePath, status: 'already-patched', replacements: 0 };
  }

  const result = replaceInvariantCalls(original, replacement);
  if (result.replacements === 0) {
    return { filePath, status: 'no-match', replacements: 0 };
  }

  writeFileSync(filePath, result.source, 'utf8');
  return { filePath, status: 'patched', replacements: result.replacements };
}

const projectRoot = process.cwd();
const nextPackagePath = path.join(projectRoot, 'node_modules', 'next', 'package.json');

if (!existsSync(nextPackagePath)) {
  process.exit(0);
}

const nextPackage = JSON.parse(readFileSync(nextPackagePath, 'utf8'));
const nextVersion = String(nextPackage.version || '');

if (!nextVersion.startsWith('15.5.')) {
  console.log(`[CentralHub] WebContainer compatibility patch not required for Next.js ${nextVersion}.`);
  process.exit(0);
}

const requestDirCjs = path.join(projectRoot, 'node_modules', 'next', 'dist', 'server', 'request');
const requestDirEsm = path.join(projectRoot, 'node_modules', 'next', 'dist', 'esm', 'server', 'request');

const paramsFallback = `return process.env.NODE_ENV === 'development'\n    ? createRenderParamsInDev(underlyingParams, undefined, workStore)\n    : createRenderParamsInProd(underlyingParams); /* ${WEBCONTAINER_MARKER} */`;

const searchParamsFallback = `return typeof underlyingSearchParams !== 'undefined'\n    ? createRenderSearchParams(underlyingSearchParams, workStore)\n    : Promise.resolve({}); /* ${WEBCONTAINER_MARKER} */`;

const pathnameFallback = `return createRenderPathname(underlyingPathname); /* ${WEBCONTAINER_MARKER} */`;

const targets = [
  [path.join(requestDirCjs, 'params.js'), paramsFallback],
  [path.join(requestDirCjs, 'search-params.js'), searchParamsFallback],
  [path.join(requestDirCjs, 'pathname.js'), pathnameFallback],
  [path.join(requestDirEsm, 'params.js'), paramsFallback],
  [path.join(requestDirEsm, 'search-params.js'), searchParamsFallback],
  [path.join(requestDirEsm, 'pathname.js'), pathnameFallback],
];

const results = targets.map(([filePath, replacement]) => patchFile(filePath, replacement));
const patched = results.filter((r) => r.status === 'patched');
const usable = results.filter((r) => r.status === 'patched' || r.status === 'already-patched');

if (usable.length === 0) {
  console.log('[CentralHub] No Next.js request-runtime files found to patch.');
  process.exit(0);
}

if (patched.length > 0) {
  console.log(
    `[CentralHub] Applied Bolt/WebContainer compatibility patch to Next.js ${nextVersion} (${patched.reduce(
      (sum, r) => sum + r.replacements,
      0,
    )} invariant guards).`,
  );
} else {
  console.log(`[CentralHub] Bolt/WebContainer compatibility patch already active for Next.js ${nextVersion}.`);
}

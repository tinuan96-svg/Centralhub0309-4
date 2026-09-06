import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const WEBCONTAINER_MARKER = 'CENTRALHUB_WEBCONTAINER_ALS_COMPAT';

function isWebContainer() {
  return Boolean(process.versions?.webcontainer) || process.env.SHELL === '/bin/jsh';
}

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

function applyWebContainerNextPatch(projectRoot) {
  const nextPackagePath = path.join(projectRoot, 'node_modules', 'next', 'package.json');
  if (!existsSync(nextPackagePath)) {
    throw new Error('Next.js is not installed yet. Run npm install before starting the dev server.');
  }

  const nextPackage = JSON.parse(readFileSync(nextPackagePath, 'utf8'));
  const nextVersion = String(nextPackage.version || '');

  // This compatibility shim is intentionally limited to the affected 15.5.x
  // WebContainer runtime. Production builds continue using the unmodified,
  // security-patched Next.js dependency declared in package.json.
  if (!nextVersion.startsWith('15.5.')) {
    console.log(`[CentralHub] WebContainer compatibility patch not required for Next.js ${nextVersion}.`);
    return;
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
  const patched = results.filter((result) => result.status === 'patched');
  const usable = results.filter((result) => result.status === 'patched' || result.status === 'already-patched');
  const failed = results.filter((result) => result.status === 'no-match');

  if (failed.length > 0) {
    throw new Error(
      `Next.js WebContainer compatibility patch could not recognise: ${failed
        .map((result) => path.relative(projectRoot, result.filePath))
        .join(', ')}`,
    );
  }

  if (usable.length === 0) {
    throw new Error('Next.js WebContainer compatibility patch found no request-runtime files to patch.');
  }

  if (patched.length > 0) {
    console.log(
      `[CentralHub] Applied Bolt/WebContainer compatibility patch to Next.js ${nextVersion} (${patched.reduce(
        (sum, result) => sum + result.replacements,
        0,
      )} invariant guards).`,
    );
  } else {
    console.log(`[CentralHub] Bolt/WebContainer compatibility patch already active for Next.js ${nextVersion}.`);
  }
}

const projectRoot = process.cwd();

if (isWebContainer()) {
  applyWebContainerNextPatch(projectRoot);
} else {
  console.log('[CentralHub] Standard Node environment detected; Next.js runs unmodified.');
}

const nextBin = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!existsSync(nextBin)) {
  throw new Error(`Next.js CLI was not found at ${nextBin}`);
}

const child = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

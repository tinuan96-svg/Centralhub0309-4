'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const home = read('app/page.tsx');
const mobile = read('components/PublicMobileNavigation.tsx');
const gallery = read('components/PublicRealIntegrationsShowcase.tsx');

test('Public homepage gives mobile and desktop visitors the full demo and login routes', () => {
  assert.match(home, /import PublicMobileNavigation from/);
  assert.match(home, /<PublicMobileNavigation\s*\/>/);
  assert.match(home, /<Link href="\/demo"/);
  assert.match(home, /<Link href="\/login"/);
  assert.match(mobile, /href: '\/demo'/);
  assert.match(mobile, /href: '#real-integrations'/);
  assert.match(mobile, /aria-expanded=\{open\}/);
  assert.match(mobile, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(mobile, /event\.key === 'Escape'/);
  assert.match(read('app/demo/page.tsx'), /DemoDashboardClient/);
  assert.match(read('app/login/page.tsx'), /LoginClient/);
});
test('All homepage sections referenced in desktop and mobile links are present', () => {
  const sources = [home,read('components/PublicAddonCatalog.tsx'),read('components/PublicFeatureShowcase.tsx'),read('components/PublicInteractiveDemo.tsx'),gallery].join('\n');
  const links = [...home.matchAll(/href="#([a-z-]+)"/g),...mobile.matchAll(/href: '#([a-z-]+)'/g)].map(match => match[1]);
  for(const anchor of links) assert.match(sources,new RegExp('id="'+anchor+'"'), 'Missing homepage anchor #'+anchor);
});
test('Promotional feature image paths resolve to committed public assets', () => {
  const sources = [home,read('components/PublicAddonCatalog.tsx')].join('\n');
  const images = [...sources.matchAll(/["'](\/(?:feature-visuals\/[^"']+|nora-secure-access\.webp))["']/g)].map(match => match[1]);
  assert.ok(images.length >= 15, 'Expected individual original and illustrated marketing images');
  for(const image of images) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', image)), 'Missing marketing asset '+image);
});
test('Public showcase uses fictional previews until vetted actual screenshots exist', () => {
  const data = read('lib/publicFeatureGallery.ts');
  assert.match(data,/existsSync\(join\(process\.cwd\(\),'public','home-demo',file\)\)/);
  assert.match(gallery,/Fictional preview · not a screenshot/);
  assert.match(gallery,/Illustrative interface only/);
  assert.match(gallery,/href="\/demo"/);
  assert.doesNotMatch(gallery, /supabase|service_role|localStorage|sessionStorage|fetch\(/i);
});

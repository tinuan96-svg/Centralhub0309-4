'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const login = source('app/login/LoginClient.tsx');
const css = source('app/login/NoraOrb.module.css');
const orb = source('app/login/NoraOrb.tsx');
test('Phone and short viewport NORA art scales down while the secure action grid remains visible', () => {
  assert.match(css, /height: clamp\(146px, 46vw, 185px\)/);
  assert.match(css, /max-width: 480px\) and \(max-height: 680px/);
  assert.match(login, /grid grid-cols-2 gap-2 sm:mt-3 sm:grid-cols-1/);
  assert.match(login, /mb-1 inline-flex min-h-7/);
  assert.match(login, /<details className=/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
test('Login security and demo access are unchanged by responsive visual adjustments', () => {
  assert.match(login, /completeReturningUserUnlock/);
  assert.match(login, /AuthService\.signIn\(email, password\)/);
  assert.match(login, /OTPService\.sendOTP/);
  assert.match(login, /OTPService\.verifyOTP/);
  assert.match(login, /requestSecureUnlock/);
  assert.match(login, /href="\/demo"/);
  assert.match(login, /router\.replace\('\/dashboard'\)/);
  assert.doesNotMatch(orb, /@\/lib\/supabase|AuthService|fetch\(/);
});

test('Approved user-uploaded NORA image is the actual animated login artwork', () => {
  const imagePath = path.join(__dirname, '..', 'public/feature-visuals/nora_approved_hero.webp');
  assert.ok(fs.existsSync(imagePath), 'Selected approved NORA image must be committed');
  assert.ok(fs.statSync(imagePath).size > 20000, 'Selected approved NORA image must not be a placeholder');
  assert.ok(orb.includes('src="/feature-visuals/nora_approved_hero.webp"'));
  assert.ok(css.includes('.approvedArtwork'));
  assert.ok(css.includes('@keyframes alive'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(!orb.includes('styles.sphere'));
  assert.ok(!orb.includes('styles.sphereLabel'));
});

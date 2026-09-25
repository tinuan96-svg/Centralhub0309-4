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
  assert.ok(css.includes('height: clamp(142px, min(53vw, 24dvh), 216px)'));
  assert.match(css, /max-width: 480px\) and \(max-height: 680px/);
  assert.match(login, /grid grid-cols-2 gap-2 sm:mt-3 sm:grid-cols-1/);
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
  assert.ok(orb.includes('/feature-visuals/nora_approved_hero.webp'));
  assert.ok(css.includes('.approvedArtwork'));
  assert.ok(css.includes('@keyframes alive'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(!orb.includes('styles.sphere'));
  assert.ok(!orb.includes('styles.sphereLabel'));
});

test('The actual approved hero blends seamlessly and has independently animated energy', () => {
  assert.ok(css.includes('mask-image: radial-gradient'));
  assert.ok(css.includes('@keyframes energySweep'));
  assert.ok(css.includes('@keyframes orbitTrack'));
  assert.ok(orb.includes('styles.energySweep'));
  assert.ok(orb.includes('styles.orbitNodes'));
  assert.ok(orb.includes('nora_approved_hero.webp'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});

test('NORA rotates available artworks randomly without repeating the last displayed image', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public/feature-visuals/nora-ai-original.jpg')));
  assert.ok(orb.includes('/feature-visuals/nora-ai-original.jpg'));
  assert.ok(orb.includes("localStorage.getItem(LAST_IMAGE_KEY)"));
  assert.ok(orb.includes("localStorage.setItem(LAST_IMAGE_KEY, String(next))"));
  assert.ok(orb.includes('.filter(index => index !== safePrevious)'));
  assert.ok(orb.includes('Math.random() * candidates.length'));
  assert.ok(orb.includes('if (event.persisted) chooseImage()'));
  assert.ok(orb.includes('if (!mountedOnce.current)'));
  assert.ok(orb.includes('imageIndex === 1 ? styles.circuitArtwork'));
  assert.ok(css.includes('.circuitArtwork'));
  assert.ok(css.includes('@keyframes heroEnter'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});

test('NORA title and login actions remain accessible with external floating widgets', () => {
  assert.match(login, /relative z-10 mt-2 text-/);
  assert.ok(login.includes('pb-[max(48px,env(safe-area-inset-bottom))]'));
  assert.match(css, /mix-blend-mode: screen/);
  assert.match(login, /href="\/demo"/);
  assert.match(login, /completeReturningUserUnlock/);
});

test('Tall Fold and Android phone viewports use balanced NORA layout without shrinking controls on short screens', () => {
  const layout = source('app/login/LoginResponsive.module.css');
  assert.ok(login.includes("import loginLayout from './LoginResponsive.module.css'"));
  assert.ok(login.includes("loginLayout.content"));
  assert.ok(layout.includes('min-height: 0;'));
  assert.ok(layout.includes('justify-content: center;'));
  assert.ok(layout.includes('max-height: 740px'));
  assert.ok(layout.includes('justify-content: flex-start;'));
  assert.ok(css.includes('max-width: 480px) and (min-height: 800px'));
  assert.ok(css.includes('height: clamp(170px, min(54vw, 23dvh), 216px)'));
  assert.ok(login.includes('completeReturningUserUnlock()'));
  assert.ok(login.includes('href="/demo"'));
});

test('Both rotating visuals dissolve into the actual page rather than showing a photo rectangle', () => {
  assert.ok(orb.includes('styles.artworkFrame'));
  assert.ok(css.includes('.artworkFrame {'));
  assert.ok(css.includes('aspect-ratio: 760 / 501'));
  assert.ok(css.includes('mix-blend-mode: screen'));
  assert.ok(css.includes('contain: layout;'));
  assert.ok(!css.includes('contain: layout paint'));
  assert.ok(css.includes('background: transparent;'));
  assert.ok(css.includes('mask-image: radial-gradient'));
  assert.ok(orb.includes('styles.circuitArtwork'));
  assert.ok(login.includes('loginLayout.content'));
});

test('NORA has exactly one demo entry point and responsive animated visuals', () => {
  const layout = source('app/login/LoginResponsive.module.css');
  assert.equal(login.split('href="/demo"').length - 1, 1);
  assert.equal(login.split('Try Demo Data').length - 1, 1);
  assert.ok(!login.includes('Open demo dashboard'));
  assert.ok(login.includes('Verify this device'));
  assert.ok(login.includes('Login ID & password'));
  assert.ok(login.includes('Staff login'));
  assert.ok(login.includes('completeReturningUserUnlock()'));
  assert.ok(login.includes('OTPService.sendOTP'));
  assert.ok(login.includes('OTPService.verifyOTP'));
  assert.ok(css.includes('height: clamp(196px, min(39vw, 30dvh), 360px)'));
  assert.ok(css.includes('height: clamp(170px, min(54vw, 23dvh), 216px)'));
  assert.ok(css.includes('height: clamp(124px, 23dvh, 148px)'));
  assert.ok(css.includes('scale(1.055)'));
  assert.ok(css.includes('translateY(-1.7%) scale(1.038)'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(layout.includes('min-height: 0;'));
  assert.ok(orb.includes('pickRandomDifferentImage'));
});

test('Fold viewport and browser chrome do not force the login card below the screen', () => {
  const layout = source('app/login/LoginResponsive.module.css');
  assert.ok(login.includes('flex min-h-[100dvh] flex-col'));
  assert.ok(login.includes('flex-1 flex-col items-center justify-center'));
  assert.ok(!login.includes('min-h-[calc(100dvh-45px)]'));
  assert.ok(!login.includes('pb-[calc(7rem+env(safe-area-inset-bottom))]'));
  assert.ok(login.includes('pb-[max(48px,env(safe-area-inset-bottom))]'));
  assert.ok(layout.includes('min-height: 0;'));
  assert.ok(layout.includes('max-height: 740px'));
  assert.ok(css.includes('min(53vw, 24dvh)'));
  assert.ok(css.includes('height: clamp(124px, 23dvh, 148px)'));
  assert.ok(login.includes('completeReturningUserUnlock()'));
  assert.equal(login.split('href="/demo"').length - 1, 1);
});

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './NoraOrb.module.css';

type NoraPhase = 'idle' | 'listening' | 'verifying';

// Decorative visual only. Voice recognition, biometrics and authorisation
// remain in the existing secure CentralHub login flow.
const NORA_IMAGES = [
  '/feature-visuals/nora_approved_hero.webp',
  '/feature-visuals/nora-ai-original.jpg',
] as const;

// Last selection is persisted across browser reopens when storage is available.
// This module fallback also avoids immediate repeats in one open app session
// when storage is unavailable or disabled.
const LAST_IMAGE_KEY = 'centralhub:nora:last-hero';
let lastImageInTab = -1;

function pickRandomDifferentImage(previous: number, count: number) {
  if (count <= 1) return 0;
  const safePrevious = Number.isInteger(previous) && previous >= 0 && previous < count ? previous : -1;
  const candidates = Array.from({ length: count }, (_, index) => index).filter(index => index !== safePrevious);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const stars = Array.from({ length: 19 }, (_, i) => ({
  left: (i * 47 + 13) % 100,
  top: (i * 31 + 7) % 90,
  delay: -(i % 7) * .43,
}));

export default function NoraOrb({ phase }: { phase: NoraPhase }) {
  // Keep SSR and the first hydration render identical; select the variant
  // after mount and fade it in. Never gate secure login on decorative art.
  const [imageIndex, setImageIndex] = useState<number | null>(null);
  const [hasImageLoaded, setHasImageLoaded] = useState(false);
  const mountedOnce = useRef(false);

  const chooseImage = useCallback(() => {
    let previous = lastImageInTab;
    try {
      const stored = window.localStorage.getItem(LAST_IMAGE_KEY);
      const parsed = stored === null ? -1 : Number(stored);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed < NORA_IMAGES.length) previous = parsed;
    } catch { /* Browser storage may be disabled; module memory is the fallback. */ }

    const next = pickRandomDifferentImage(previous, NORA_IMAGES.length);
    lastImageInTab = next;
    try { window.localStorage.setItem(LAST_IMAGE_KEY, String(next)); } catch { /* Visual-only feature. */ }
    setHasImageLoaded(false);
    setImageIndex(next);
  }, []);

  useEffect(() => {
    if (!mountedOnce.current) {
      mountedOnce.current = true;
      chooseImage();
    }
    // A restored back/forward-cache page has reopened without remounting.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) chooseImage(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [chooseImage]);

  return (
    <div
      role="img"
      aria-label="NORA AI artwork: a luminous blue holographic face within electric orbital rings, gently moving with light pulses"
      className={[styles.scene, phase === 'verifying' ? styles.verifying : phase === 'listening' ? styles.listening : styles.idle].join(' ')}
    >
      <div aria-hidden="true" className={styles.aura} />
      {imageIndex !== null && (
        <img
          key={imageIndex}
          src={NORA_IMAGES[imageIndex]}
          alt=""
          width={760}
          height={501}
          decoding="async"
          draggable={false}
          onLoad={() => setHasImageLoaded(true)}
          onError={() => {
            // A broken alternative must not leave the hero invisible.
            setImageIndex(0);
            setHasImageLoaded(true);
          }}
          className={[styles.approvedArtwork, hasImageLoaded ? styles.artworkVisible : styles.artworkLoading,
            imageIndex === 1 ? styles.circuitArtwork : ''].join(' ')}
        />
      )}
      <div aria-hidden="true" className={styles.energyHalo} />
      <div aria-hidden="true" className={styles.energySweep} />
      <div aria-hidden="true" className={styles.orbitNodes}>
        <i className={styles.orbitNode} />
        <i className={styles.orbitNode} />
        <i className={styles.orbitNode} />
      </div>
      <div aria-hidden="true" className={styles.orbitAccent} />
      <div aria-hidden="true" className={styles.stars}>
        {stars.map((star, i) => (
          <i
            key={i}
            className={styles.star}
            style={{ left: star.left + '%', top: star.top + '%', animationDelay: star.delay + 's' }}
          />
        ))}
      </div>
    </div>
  );
}

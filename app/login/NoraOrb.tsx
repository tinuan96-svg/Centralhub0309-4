'use client';

import styles from './NoraOrb.module.css';

type NoraPhase = 'idle' | 'listening' | 'verifying';

// Decorative visual only. Voice recognition, biometrics and authorisation
// remain in the existing secure CentralHub login flow.
const stars = Array.from({ length: 19 }, (_, i) => ({
  left: (i * 47 + 13) % 100,
  top: (i * 31 + 7) % 90,
  delay: -(i % 7) * .43,
}));

export default function NoraOrb({ phase }: { phase: NoraPhase }) {
  return (
    <div
      role="img"
      aria-label="NORA AI artwork: a luminous blue holographic face within electric orbital rings, gently moving with light pulses"
      className={[styles.scene, phase === 'verifying' ? styles.verifying : phase === 'listening' ? styles.listening : styles.idle].join(' ')}
    >
      <div aria-hidden="true" className={styles.aura} />
      <img
        src="/feature-visuals/nora_approved_hero.webp"
        alt=""
        width={760}
        height={501}
        decoding="async"
        draggable={false}
        className={styles.approvedArtwork}
      />
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

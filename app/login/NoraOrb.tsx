'use client';

import styles from './NoraOrb.module.css';

type NoraPhase = 'idle' | 'listening' | 'verifying';

// Visual animation only. Actual wake-word detection and access control
// remain with the Android bridge and the existing secure login handlers.
const bars = Array.from({ length: 24 }, (_, i) => ({
  height: 10 + Math.abs(Math.sin(i * 0.66) * 68) + Math.abs(Math.cos(i * 0.34) * 12),
  delay: -(i % 9) * 0.13,
}));
const stars = Array.from({ length: 21 }, (_, i) => ({
  left: (i * 47 + 13) % 100,
  top: (i * 31 + 7) % 72,
  delay: -(i % 7) * 0.43,
}));

export default function NoraOrb({ phase }: { phase: NoraPhase }) {
  return (
    <div
      role="img"
      aria-label="NORA: moving blue AI orb with orbiting holographic light rings and voice waveforms"
      className={[styles.scene, phase === 'verifying' ? styles.verifying : phase === 'listening' ? styles.listening : styles.idle].join(' ')}
    >
      <div aria-hidden="true" className={styles.stars}>
        {stars.map((star, i) => <i key={i} className={styles.star} style={{ left: star.left + '%', top: star.top + '%', animationDelay: star.delay + 's' }} />)}
      </div>
      <div aria-hidden="true" className={[styles.wave, styles.waveLeft].join(' ')}>
        {bars.map((bar, i) => <i key={i} className={styles.waveBar} style={{ height: bar.height + '%', animationDelay: bar.delay + 's' }} />)}
      </div>
      <div aria-hidden="true" className={[styles.wave, styles.waveRight].join(' ')}>
        {bars.map((bar, i) => <i key={i} className={styles.waveBar} style={{ height: bar.height + '%', animationDelay: (bar.delay - .31) + 's' }} />)}
      </div>
      <div aria-hidden="true" className={styles.orbArea}>
        <div className={styles.halo} />
        <div className={[styles.orbit, styles.orbitBehind].join(' ')} />
        <div className={[styles.orbit, styles.orbitVertical].join(' ')} />
        <div className={styles.sphere}>
          <div className={styles.mesh} />
          <div className={styles.sphereLabel}>AI</div>
        </div>
        <div className={[styles.orbit, styles.orbitFront].join(' ')} />
      </div>
      <div aria-hidden="true" className={styles.platform}><div className={styles.platformCenter} /></div>
    </div>
  );
}

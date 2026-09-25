'use client';

import { useEffect, useRef } from 'react';

type Phase = 'idle' | 'listening' | 'verifying';

const TAU = Math.PI * 2;

// NORA is drawn anew on every frame. No still picture is moved to fake life.
// All rendering is local to the browser; no microphone, network or auth access.
export default function NoraLivingCanvas({
  phase,
  playing,
  className,
}: {
  phase: Phase;
  playing: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !parent || !ctx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastPaint = -Infinity;
    let lastTime = 0;
    let elapsed = 0;
    let visible = !document.hidden;
    const speed = phase === 'verifying' ? 1.8 : phase === 'listening' ? 1.35 : 1;

    const draw = (t: number) => {
      if (width <= 0 || height <= 0) return;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height * .45;
      const r = Math.min(height * .37, width * .245);
      const pulse = (Math.sin(t * 2.5) + 1) / 2;
      const ringColor = phase === 'verifying' ? '#abedff' : '#36caff';

      // An expanding energy field behind the living face.
      const glow = ctx.createRadialGradient(cx, cy, r * .43, cx, cy, r * 1.56);
      glow.addColorStop(0, `rgba(0,104,240,${.27 + pulse * .12})`);
      glow.addColorStop(.58, 'rgba(0,103,230,.14)');
      glow.addColorStop(1, 'rgba(0,78,200,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.56, 0, TAU);
      ctx.fill();

      // Moving holographic landing pad and beam.
      ctx.save();
      ctx.shadowColor = '#23aaff';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(62,194,255,${.55 + .22 * pulse})`;
      ctx.lineWidth = 1.5;
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 1.30, r * (1.2 + ring * .34), r * (.16 + ring * .044), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();

      // The orb has an opaque, animated interior, so eyes and energy really
      // change frame by frame, instead of revealing the still image below.
      const shell = ctx.createRadialGradient(cx - r * .2, cy - r * .25, r * .07, cx, cy, r);
      shell.addColorStop(0, '#114b88');
      shell.addColorStop(.42, '#072b59');
      shell.addColorStop(.83, '#04162f');
      shell.addColorStop(.97, '#0a63c5');
      shell.addColorStop(1, '#7af4ff');
      ctx.save();
      ctx.shadowColor = '#13baff';
      ctx.shadowBlur = 14 + pulse * 17;
      ctx.fillStyle = shell;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r * .94, 0, TAU);
      ctx.clip();

      // Flowing electric filaments cross the FACE, not merely the border.
      for (let filament = 0; filament < 12; filament++) {
        const start = filament * TAU / 12 + t * (.3 + filament % 3 * .11);
        const radius = r * (.28 + filament % 4 * .17);
        const x = cx + Math.cos(start) * radius;
        const y = cy + Math.sin(start * 1.35) * r * .36;
        ctx.beginPath();
        ctx.moveTo(x - r * .33, y - r * .24);
        ctx.bezierCurveTo(
          cx + Math.sin(t * 1.3 + filament) * r * .38, cy - r * .17,
          cx + Math.cos(t * 1.1 + filament) * r * .48, cy + r * .2,
          x + r * .19, y + r * .35,
        );
        ctx.strokeStyle = `rgba(${filament % 3 ? '54,179,255' : '163,243,255'},${.12 + .15 * (.5 + Math.sin(t * 2 + filament) / 2)})`;
        ctx.lineWidth = filament % 4 === 0 ? 1.8 : .8;
        ctx.stroke();
      }

      // A visibly sweeping internal light field.
      const sweep = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      const scan = ((t * .24) % 2) - 1;
      sweep.addColorStop(0, 'rgba(0,0,0,0)');
      sweep.addColorStop(Math.max(.001, Math.min(.999, (scan + 1) / 2)), 'rgba(118,233,255,.25)');
      sweep.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sweep;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();

      // Independent eyes blink every ~4 seconds and pupils subtly track.
      const cycle = t % 4.1;
      const closing = cycle > 3.55 && cycle < 3.78
        ? Math.max(.07, Math.abs(cycle - 3.665) / .115) : 1;
      const look = Math.sin(t * .87) * r * .042;
      for (const side of [-1, 1]) {
        const ex = cx + side * r * .37 + look;
        const ey = cy - r * .005;
        const ew = r * .18;
        const eh = r * .068 * closing;
        ctx.save();
        ctx.shadowColor = '#50e1ff';
        ctx.shadowBlur = 13 + 9 * pulse;
        ctx.fillStyle = '#c9faff';
        ctx.beginPath();
        ctx.moveTo(ex - ew, ey - eh);
        ctx.quadraticCurveTo(ex, ey - eh * 2.4, ex + ew, ey - eh * .2);
        ctx.quadraticCurveTo(ex, ey + eh * 1.8, ex - ew, ey - eh);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(r * .31)}px Arial, sans-serif`;
      ctx.shadowColor = '#43d3ff';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#f1fcff';
      ctx.fillText('AI', cx, cy + r * .29);
      ctx.restore();

      // Physically changing orbital positions (not a static ring + CSS glow).
      for (let n = 0; n < 3; n++) {
        const angle = t * (n % 2 ? -.72 : .85) + n * 1.18;
        const rx = r * (1.38 + n * .07);
        const ry = r * (.43 + n * .035);
        const tilt = -.26 + n * .18;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.shadowColor = ringColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = `rgba(85,206,255,${.63 - n * .10})`;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, angle * .17, 0, TAU);
        ctx.stroke();
        // The bright spark completes a full orbit in 5–9 seconds.
        const sx = Math.cos(angle) * rx;
        const sy = Math.sin(angle) * ry;
        ctx.fillStyle = '#e7ffff';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.8, r * .027), 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // Moving equalizer lines respond visually to phase, without implying
      // microphone access in the normal browser login.
      for (const side of [-1, 1]) {
        for (let bar = 0; bar < 14; bar++) {
          const x = cx + side * (r * 1.48 + bar * r * .083);
          const amplitude = (.24 + .76 * Math.abs(Math.sin(t * 3.4 + bar * .68))) * r * .37;
          ctx.strokeStyle = `rgba(55,185,255,${.20 + .37 * Math.abs(Math.sin(t * 2.1 + bar))})`;
          ctx.lineWidth = Math.max(1, r * .012);
          ctx.beginPath();
          ctx.moveTo(x, cy - amplitude);
          ctx.lineTo(x, cy + amplitude);
          ctx.stroke();
        }
      }
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(elapsed);
    };

    const tick = (now: number) => {
      if (!playing || !visible) return;
      if (now - lastPaint >= 32) {
        elapsed += lastTime ? Math.min((now - lastTime) / 1000, .05) * speed : 0;
        draw(elapsed);
        lastPaint = now;
        lastTime = now;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (!visible) {
        window.cancelAnimationFrame(frame);
        lastTime = 0;
      } else if (playing) {
        lastTime = 0;
        frame = window.requestAnimationFrame(tick);
      }
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(parent);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    resize();
    if (playing && visible) frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [phase, playing]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

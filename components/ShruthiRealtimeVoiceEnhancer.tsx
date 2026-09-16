'use client';

import { useEffect } from 'react';

type NativeBridge = {
  stopTaraTts?: () => void;
  setTaraSpeaking?: (speaking: boolean) => void;
};

type NativeTranscriptEvent = CustomEvent<{ text?: string; liveStable?: boolean }>;
type NativeRmsEvent = CustomEvent<{ level?: number }>;

const BUSINESS_CUES = /\b(?:sell|selling|price|product|stock|offer|website|competitor|check|search|grocery|order|orders|revenue|sales|deploy|deployment|repo|repository)\b/i;
let activeShruthiAudio: HTMLMediaElement | null = null;

function nativeBridge(): NativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeBridge }).CentralHubNative;
}

function normalizeCentralHubSpeech(raw: string) {
  let text = String(raw || '').trim();
  if (!text) return text;

  const businessContext = BUSINESS_CUES.test(text);
  if (businessContext) {
    text = text
      .replace(/\b(?:camera|kerala)\s+(?:test|taste|tasty)\b/gi, 'KeralaTaste')
      .replace(/\bkerala\s*taste\b/gi, 'KeralaTaste')
      .replace(/\bmallu\s+(?:spaces|spices?|spice)\b/gi, 'MalluSpices')
      .replace(/\bpocket\s+grocery\b/gi, 'PocketGrocery')
      .replace(/\bkerala\s+grocery\b/gi, 'KeralaGrocery')
      .replace(/\btamil\s+retail\b/gi, 'TamilRetail')
      .replace(/\bpick\s*easy\b/gi, 'Pickeasy')
      .replace(/\bindian\s+shelf\b/gi, 'The Indian Shelf')
      .replace(/\bnet(?:ified|lify|lifi|lefi)\b/gi, 'Netlify')
      .replace(/\bsupa\s*base\b/gi, 'Supabase')
      .replace(/\bcentral\s+hub\b/gi, 'CentralHub');
  }

  return text.replace(/\s{2,}/g, ' ').trim();
}

function stopShruthiSpeechImmediately() {
  try { window.speechSynthesis?.cancel(); } catch { }
  try { nativeBridge()?.stopTaraTts?.(); } catch { }
  try { nativeBridge()?.setTaraSpeaking?.(false); } catch { }

  const tracked = activeShruthiAudio;
  activeShruthiAudio = null;
  if (tracked) {
    try { tracked.pause(); } catch { }
    try { tracked.currentTime = 0; } catch { }
    try { tracked.dispatchEvent(new Event('ended')); } catch { }
  }

  document.querySelectorAll<HTMLAudioElement>('audio').forEach((audio) => {
    const src = String(audio.currentSrc || audio.src || '');
    if (!src.startsWith('blob:')) return;
    try { audio.pause(); } catch { }
    try { audio.currentTime = 0; } catch { }
    try { audio.dispatchEvent(new Event('ended')); } catch { }
  });
}

function setListeningBars(level: number) {
  const screen = document.querySelector<HTMLElement>('.nora-screen');
  if (!screen) return;

  const bars = Array.from(screen.querySelectorAll<HTMLElement>('.nora-wavebar'));
  const clamped = Math.max(0, Math.min(1, level));
  const middle = Math.max(1, (bars.length - 1) / 2);
  bars.forEach((bar, index) => {
    const centreWeight = 0.48 + (1 - Math.min(1, Math.abs(index - middle) / middle)) * 0.52;
    const height = 4 + clamped * 25 * centreWeight;
    bar.style.animation = 'none';
    bar.style.height = `${height.toFixed(1)}px`;
    bar.style.opacity = String(0.42 + clamped * 0.55);
  });
}

function resetListeningBars() {
  document.querySelectorAll<HTMLElement>('.nora-wavebar').forEach((bar) => {
    bar.style.removeProperty('animation');
    bar.style.removeProperty('height');
    bar.style.removeProperty('opacity');
  });
}

export default function ShruthiRealtimeVoiceEnhancer() {
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) return;

    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    const originalMediaPlay = HTMLMediaElement.prototype.play;
    let audioContext: AudioContext | null = null;
    let animationFrame = 0;
    let monitoredStream: MediaStream | null = null;
    let autoStopIssued = false;
    let lastShruthiAudioStopAt = -10_000;
    let pendingBargeText = '';
    let pendingBargeTimer: number | null = null;
    let waitingForBargeFinal = false;

    const clearBargeTimer = () => {
      if (pendingBargeTimer) window.clearTimeout(pendingBargeTimer);
      pendingBargeTimer = null;
    };

    const dispatchStableTranscript = (text: string) => {
      const clean = String(text || '').trim();
      if (!clean) return;
      window.dispatchEvent(new CustomEvent('centralhub:tara-transcript', {
        detail: { text: clean, liveStable: true },
      }));
    };

    const flushBargeDraft = () => {
      const finalText = pendingBargeText;
      pendingBargeText = '';
      waitingForBargeFinal = false;
      clearBargeTimer();
      if (finalText) dispatchStableTranscript(finalText);
    };

    HTMLMediaElement.prototype.play = function patchedShruthiPlay(this: HTMLMediaElement) {
      const src = String(this.currentSrc || this.getAttribute('src') || '');
      if (document.querySelector('.nora-screen') && src.startsWith('blob:')) {
        activeShruthiAudio = this;
        const clear = () => {
          if (activeShruthiAudio === this) activeShruthiAudio = null;
          lastShruthiAudioStopAt = performance.now();
        };
        this.addEventListener('ended', clear, { once: true });
        this.addEventListener('error', clear, { once: true });
      }
      return originalMediaPlay.call(this);
    };

    const cleanupMeter = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      monitoredStream = null;
      resetListeningBars();
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
        audioContext = null;
      }
    };

    const monitorShruthiStream = (stream: MediaStream) => {
      cleanupMeter();
      monitoredStream = stream;
      autoStopIssued = false;

      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      audioContext = new AudioContextCtor();
      void audioContext.resume().catch(() => undefined);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const startedAt = performance.now();
      let voiceStarted = false;
      let voiceStartedAt = 0;
      let lastVoiceAt = 0;
      let noiseFloor = 0.008;
      let displayed = 0;

      const frame = () => {
        if (monitoredStream !== stream || !stream.active) {
          cleanupMeter();
          return;
        }

        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const sample = (samples[i] - 128) / 128;
          energy += sample * sample;
        }
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();

        if (!voiceStarted && now - startedAt < 420) noiseFloor = noiseFloor * 0.82 + rms * 0.18;
        const threshold = Math.max(0.018, noiseFloor * 2.35);
        const speechLevel = Math.max(0, Math.min(1, (rms - threshold * 0.55) / Math.max(0.045, threshold * 3.2)));
        displayed = displayed * 0.54 + speechLevel * 0.46;
        setListeningBars(displayed);

        if (rms >= threshold) {
          if (!voiceStarted) {
            voiceStarted = true;
            voiceStartedAt = now;
          }
          lastVoiceAt = now;
        } else if (!voiceStarted) {
          noiseFloor = noiseFloor * 0.985 + rms * 0.015;
        }

        const stopButton = document.querySelector<HTMLButtonElement>('.nora-screen button[aria-label="Stop listening"]');
        const speechLongEnough = voiceStarted && now - voiceStartedAt >= 220;
        const naturalEnd = speechLongEnough && lastVoiceAt > 0 && now - lastVoiceAt >= 560;
        const noSpeechTimeout = !voiceStarted && now - startedAt >= 6000;

        if (!autoStopIssued && stopButton && (naturalEnd || noSpeechTimeout)) {
          autoStopIssued = true;
          stopButton.click();
          return;
        }

        animationFrame = requestAnimationFrame(frame);
      };

      animationFrame = requestAnimationFrame(frame);
    };

    const patchedGetUserMedia = async (constraints?: MediaStreamConstraints) => {
      const shruthiVisible = Boolean(document.querySelector('.nora-screen'));
      const audioRequested = Boolean(constraints?.audio);
      const videoRequested = Boolean(constraints?.video);
      const isShruthiVoiceCapture = shruthiVisible && audioRequested && !videoRequested;

      if (isShruthiVoiceCapture) stopShruthiSpeechImmediately();
      const stream = await originalGetUserMedia(constraints);
      if (isShruthiVoiceCapture) monitorShruthiStream(stream);
      return stream;
    };

    mediaDevices.getUserMedia = patchedGetUserMedia as typeof mediaDevices.getUserMedia;

    const onAudioStop = (event: Event) => {
      const audio = event.target;
      if (!(audio instanceof HTMLAudioElement)) return;
      const src = String(audio.currentSrc || audio.src || '');
      if (!src.startsWith('blob:') && activeShruthiAudio !== audio) return;
      if (activeShruthiAudio === audio) activeShruthiAudio = null;
      lastShruthiAudioStopAt = performance.now();
    };

    const onTranscript = (event: Event) => {
      const transcriptEvent = event as NativeTranscriptEvent;
      if (!transcriptEvent.detail || transcriptEvent.detail.liveStable) return;

      const normalized = normalizeCentralHubSpeech(String(transcriptEvent.detail.text || ''));
      if (!normalized) return;
      transcriptEvent.detail.text = normalized;

      const now = performance.now();
      const justInterruptedShruthi = activeShruthiAudio !== null || now - lastShruthiAudioStopAt < 800;

      // Android may emit an early partial phrase as soon as the user interrupts.
      // Stop Shruthi immediately, but hold that partial until the recognizer sends
      // the completed phrase after the user naturally finishes speaking.
      if (justInterruptedShruthi || waitingForBargeFinal) {
        event.stopImmediatePropagation();
        event.preventDefault();
        stopShruthiSpeechImmediately();

        if (!waitingForBargeFinal) {
          waitingForBargeFinal = true;
          pendingBargeText = normalized;
          clearBargeTimer();
          pendingBargeTimer = window.setTimeout(flushBargeDraft, 3000);
          return;
        }

        if (normalized.length >= pendingBargeText.length || normalized.toLowerCase() !== pendingBargeText.toLowerCase()) {
          pendingBargeText = normalized;
        }
        const finalText = pendingBargeText;
        pendingBargeText = '';
        waitingForBargeFinal = false;
        clearBargeTimer();
        window.setTimeout(() => dispatchStableTranscript(finalText), 70);
      }
    };

    const onNativeRms = (event: Event) => {
      const level = Number((event as NativeRmsEvent).detail?.level ?? 0);
      if (Number.isFinite(level)) setListeningBars(level);
    };

    const onClickCapture = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!target) return;
      const label = target.getAttribute('aria-label') || '';
      if (label === 'Talk to SHRUTHI') stopShruthiSpeechImmediately();
    };

    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
    window.addEventListener('centralhub:tara-rms', onNativeRms as EventListener);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('pause', onAudioStop, true);
    document.addEventListener('ended', onAudioStop, true);

    return () => {
      window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
      window.removeEventListener('centralhub:tara-rms', onNativeRms as EventListener);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('pause', onAudioStop, true);
      document.removeEventListener('ended', onAudioStop, true);
      mediaDevices.getUserMedia = originalGetUserMedia;
      HTMLMediaElement.prototype.play = originalMediaPlay;
      clearBargeTimer();
      if (activeShruthiAudio) {
        try { activeShruthiAudio.pause(); } catch { }
        activeShruthiAudio = null;
      }
      cleanupMeter();
    };
  }, []);

  return null;
}

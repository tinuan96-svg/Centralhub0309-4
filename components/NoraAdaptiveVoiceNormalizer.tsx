'use client';

import { useLayoutEffect } from 'react';

type TranscriptDetail = {
  text?: string;
  settled?: boolean;
  settle_ms?: number;
  segment_count?: number;
  communication_style?: {
    avg_gap_ms: number;
    avg_words: number;
    samples: number;
  };
};

type VoiceProfile = {
  version: 1;
  avgGapMs: number;
  avgWords: number;
  samples: number;
};

type SettledTurn = {
  text: string;
  segments: number;
  elapsed: number;
};

const EVENT_NAME = 'centralhub:tara-transcript';
const PROFILE_KEY = 'centralhub:nora-voice-profile-v1';
const DEFAULT_PROFILE: VoiceProfile = { version: 1, avgGapMs: 900, avgWords: 8, samples: 0 };
const WAKE_START = /^(?:(?:hey\s+)?(?:shruthi|sruthi|shruti|nora|norah|noora|noura|norra|tara|thara))\b[\s,:.!?-]*/iu;
const STOP_WORDS = /\b(?:(?:shruthi|sruthi|shruti|nora|norah|noora)\s+stop|stop\s+(?:shruthi|sruthi|shruti|nora|norah|noora)|that(?:'s| is) all|thank you shruthi|thanks shruthi|thank you nora|thanks nora|go to sleep|sleep shruthi|sleep nora|end conversation|stop listening)\b|നോറാ?\s*(?:സ്റ്റോപ്പ്|മതി|നിർത്തു)|(?:മതി|നിർത്തു)\s*നോറാ?|நோரா?\s*(?:ஸ்டாப்|போதும்)/iu;
const CONTINUATION_END = /(?:\b(?:and|but|or|so|because|then|also|plus|like|actually|means|if|when|with|for|to|about|from|on|in|the|a|an|my|our|your|this|that)\b|അപ്പോ|പിന്നെ|എന്നിട്ട്|അതുപോലെ|അല്ലെങ്കിൽ|കാരണം|ഒക്കെ|കൂടാതെ|അതിന്റെ|ഇതിന്റെ|എന്ന്|ஆனா|அப்புறம்|மேலும்|அது|இது)\s*[,.:;-]*$/iu;
const COMPLETE_HINT = /[?.!]$|\b(?:today|now|first|please|account|status|issue|issues|done|finish|finished|complete|completed|okay|ok)\s*[?.!]*$/iu;
const NON_SEMANTIC = /^(?:uh+|um+|hmm+|mm+|er+|ah+|ഹ്+|മ്മ്+|ം+|ம்+)$/iu;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadProfile(): VoiceProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<VoiceProfile>;
    return {
      version: 1,
      avgGapMs: clamp(Number(parsed.avgGapMs) || DEFAULT_PROFILE.avgGapMs, 450, 1800),
      avgWords: clamp(Number(parsed.avgWords) || DEFAULT_PROFILE.avgWords, 2, 40),
      samples: clamp(Number(parsed.samples) || 0, 0, 500),
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(profile: VoiceProfile) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Private browsing/storage restrictions should never break voice handling.
  }
}

function splitWake(value: string) {
  const clean = value.trim();
  const match = clean.match(WAKE_START);
  if (!match) return { woke: false, body: clean };
  return { woke: true, body: clean.slice(match[0].length).trim() };
}

function normalizeWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function overlapMerge(left: string, right: string) {
  const a = normalizeWords(left);
  const b = normalizeWords(right);
  if (!a.length) return right.trim();
  if (!b.length) return left.trim();

  const lowerA = a.map((word) => word.toLocaleLowerCase());
  const lowerB = b.map((word) => word.toLocaleLowerCase());
  const max = Math.min(8, lowerA.length, lowerB.length);
  for (let size = max; size >= 1; size -= 1) {
    const suffix = lowerA.slice(-size).join(' ');
    const prefix = lowerB.slice(0, size).join(' ');
    if (suffix === prefix) return [...a, ...b.slice(size)].join(' ').trim();
  }
  return `${left.trim()} ${right.trim()}`.trim();
}

function mergeTranscript(previous: string, incoming: string) {
  const prev = splitWake(previous);
  const next = splitWake(incoming);
  const woke = prev.woke || next.woke;
  const a = prev.body.trim();
  const b = next.body.trim();

  let body = '';
  if (!a) body = b;
  else if (!b) body = a;
  else {
    const lowerA = a.toLocaleLowerCase();
    const lowerB = b.toLocaleLowerCase();
    if (lowerB.startsWith(lowerA)) body = b;
    else if (lowerA.startsWith(lowerB)) body = a;
    else body = overlapMerge(a, b);
  }

  return woke ? `SHRUTHI${body ? ` ${body}` : ''}` : body;
}

function wordCount(value: string) {
  return normalizeWords(splitWake(value).body).length;
}

function settleDelay(text: string, profile: VoiceProfile, segmentCount: number) {
  const clean = text.trim();
  const words = wordCount(clean);
  const exactWake = /^(?:SHRUTHI|NORA)$/iu.test(clean);
  const body = splitWake(clean).body;
  let delay = clamp(profile.avgGapMs + 430, 800, 1750);

  if (exactWake) delay = Math.max(delay, 1100);
  if (words <= 2 && !exactWake) delay += 520;
  else if (words <= 4) delay += 320;
  else if (words >= 10) delay -= 120;

  if (CONTINUATION_END.test(body)) delay += 520;
  if (COMPLETE_HINT.test(body)) delay -= 180;
  if (STOP_WORDS.test(clean)) delay = Math.min(delay, 500);
  if (segmentCount > 1) delay += Math.min(260, (segmentCount - 1) * 70);

  return Math.round(clamp(delay, 650, 2400));
}

function noraBusy() {
  return Boolean(document.querySelector('.nora-processing, .nora-speaking'));
}

export default function NoraAdaptiveVoiceNormalizer() {
  useLayoutEffect(() => {
    let profile = loadProfile();
    let pending = '';
    let segmentCount = 0;
    let firstPendingAt = 0;
    let lastRawAt = 0;
    let settleTimer: number | null = null;
    let drainTimer: number | null = null;
    let queuedTurns: SettledTurn[] = [];

    const clearSettleTimer = () => {
      if (settleTimer != null) window.clearTimeout(settleTimer);
      settleTimer = null;
    };

    const clearDrainTimer = () => {
      if (drainTimer != null) window.clearTimeout(drainTimer);
      drainTimer = null;
    };

    const updateGapProfile = (gapMs: number) => {
      if (gapMs < 120 || gapMs > 2800) return;
      const alpha = profile.samples < 8 ? 0.28 : 0.16;
      profile = {
        ...profile,
        avgGapMs: clamp(profile.avgGapMs * (1 - alpha) + gapMs * alpha, 450, 1800),
        samples: Math.min(500, profile.samples + 1),
      };
    };

    const updateWordsProfile = (text: string) => {
      const words = wordCount(text);
      if (!words) return;
      const alpha = profile.samples < 8 ? 0.24 : 0.12;
      profile = {
        ...profile,
        avgWords: clamp(profile.avgWords * (1 - alpha) + words * alpha, 2, 40),
        samples: Math.min(500, profile.samples + 1),
      };
      saveProfile(profile);
    };

    const dispatchSettled = (turn: SettledTurn) => {
      updateWordsProfile(turn.text);
      window.dispatchEvent(new CustomEvent<TranscriptDetail>(EVENT_NAME, {
        detail: {
          text: turn.text,
          settled: true,
          settle_ms: turn.elapsed,
          segment_count: turn.segments,
          communication_style: {
            avg_gap_ms: Math.round(profile.avgGapMs),
            avg_words: Number(profile.avgWords.toFixed(1)),
            samples: profile.samples,
          },
        },
      }));
    };

    const drainQueue = () => {
      clearDrainTimer();
      if (!queuedTurns.length) return;
      if (noraBusy()) {
        drainTimer = window.setTimeout(drainQueue, 420);
        return;
      }

      const next = queuedTurns.shift();
      if (!next) return;
      dispatchSettled(next);

      // Let React apply Processing/Speaking state before evaluating the next queued turn.
      if (queuedTurns.length) drainTimer = window.setTimeout(drainQueue, 650);
    };

    const enqueueTurn = (turn: SettledTurn) => {
      if (!turn.text || NON_SEMANTIC.test(splitWake(turn.text).body)) return;
      if (STOP_WORDS.test(turn.text)) {
        // A stop/end instruction supersedes queued conversational turns, but still waits
        // until the current response has finished so the assistant cannot drop it.
        queuedTurns = [turn];
      } else {
        queuedTurns.push(turn);
        if (queuedTurns.length > 6) queuedTurns = queuedTurns.slice(-6);
      }
      drainQueue();
    };

    const flush = () => {
      clearSettleTimer();
      if (!pending) return;

      const turn: SettledTurn = {
        text: pending.trim(),
        segments: segmentCount,
        elapsed: firstPendingAt ? Date.now() - firstPendingAt : 0,
      };
      pending = '';
      segmentCount = 0;
      firstPendingAt = 0;
      enqueueTurn(turn);
    };

    const scheduleFlush = () => {
      clearSettleTimer();
      const delay = settleDelay(pending, profile, segmentCount);
      settleTimer = window.setTimeout(flush, delay);
    };

    const onTranscript = (event: Event) => {
      const custom = event as CustomEvent<TranscriptDetail>;
      if (custom.detail?.settled) return;

      const incoming = String(custom.detail?.text || '').trim();
      if (!incoming) return;

      // SHRUTHI should hear one natural turn, not every Android segmented fragment.
      event.stopImmediatePropagation();

      const body = splitWake(incoming).body;
      if (NON_SEMANTIC.test(body)) return;

      const now = Date.now();
      const gap = lastRawAt ? now - lastRawAt : 0;

      // A long silence closes the previous turn. It is queued instead of being glued
      // to the next sentence, even when SHRUTHI is still processing/speaking.
      if (pending && gap > 2800) flush();
      else if (pending && gap) updateGapProfile(gap);

      pending = pending ? mergeTranscript(pending, incoming) : incoming;
      segmentCount = Math.max(1, segmentCount + 1);
      if (!firstPendingAt) firstPendingAt = now;
      lastRawAt = now;

      scheduleFlush();
    };

    window.addEventListener(EVENT_NAME, onTranscript as EventListener);
    return () => {
      clearSettleTimer();
      clearDrainTimer();
      queuedTurns = [];
      window.removeEventListener(EVENT_NAME, onTranscript as EventListener);
    };
  }, []);

  return null;
}

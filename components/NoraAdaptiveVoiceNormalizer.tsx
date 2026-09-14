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
  version: 2;
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
const PROFILE_KEY = 'centralhub:shruthi-voice-profile-v2';
const DEFAULT_PROFILE: VoiceProfile = { version: 2, avgGapMs: 480, avgWords: 8, samples: 0 };
const WAKE_START = /^(?:(?:hey\s+)?(?:shruthi|shruti|sruthi|sruti|shrudhi|shrewthi|shroothi|nora|norah|noora|noura|norra))\b[\s,:.!?-]*/iu;
const STOP_WORDS = /\b(?:(?:shruthi|shruti|sruthi|sruti|nora|norah|noora)\s+stop|stop\s+(?:shruthi|shruti|sruthi|sruti|nora|norah|noora)|that(?:'s| is) all|thank you shruthi|thanks shruthi|go to sleep|sleep shruthi|end conversation|stop listening)\b|ശ്രൂ?തി\s*(?:സ്റ്റോപ്പ്|മതി|നിർത്തു)|(?:മതി|നിർത്തു)\s*ശ്രൂ?തി|ஸ்ரூ?தி\s*(?:ஸ்டாப்|போதும்)/iu;
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
      version: 2,
      avgGapMs: clamp(Number(parsed.avgGapMs) || DEFAULT_PROFILE.avgGapMs, 260, 1000),
      avgWords: clamp(Number(parsed.avgWords) || DEFAULT_PROFILE.avgWords, 2, 40),
      samples: clamp(Number(parsed.samples) || 0, 0, 500),
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(profile: VoiceProfile) {
  try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { }
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
    if (lowerA.slice(-size).join(' ') === lowerB.slice(0, size).join(' ')) return [...a, ...b.slice(size)].join(' ').trim();
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
  let delay = clamp(profile.avgGapMs + 110, 340, 850);
  if (exactWake) delay = Math.max(delay, 420);
  if (words <= 2 && !exactWake) delay += 90;
  else if (words <= 4) delay += 45;
  else if (words >= 10) delay -= 90;
  if (CONTINUATION_END.test(body)) delay += 210;
  if (COMPLETE_HINT.test(body)) delay -= 150;
  if (STOP_WORDS.test(clean)) delay = Math.min(delay, 180);
  if (segmentCount > 1) delay += Math.min(90, (segmentCount - 1) * 25);
  return Math.round(clamp(delay, 180, 1050));
}

function assistantProcessing() {
  // Speech itself is intentionally NOT blocking. A human can interrupt Shruthi while
  // she is talking; only an in-flight model turn is briefly serialized here.
  return Boolean(document.querySelector('.nora-processing'));
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

    const clearSettleTimer = () => { if (settleTimer != null) window.clearTimeout(settleTimer); settleTimer = null; };
    const clearDrainTimer = () => { if (drainTimer != null) window.clearTimeout(drainTimer); drainTimer = null; };

    const updateGapProfile = (gapMs: number) => {
      if (gapMs < 80 || gapMs > 1800) return;
      const alpha = profile.samples < 8 ? 0.28 : 0.16;
      profile = { ...profile, avgGapMs: clamp(profile.avgGapMs * (1 - alpha) + gapMs * alpha, 260, 1000), samples: Math.min(500, profile.samples + 1) };
    };

    const updateWordsProfile = (text: string) => {
      const words = wordCount(text);
      if (!words) return;
      const alpha = profile.samples < 8 ? 0.24 : 0.12;
      profile = { ...profile, avgWords: clamp(profile.avgWords * (1 - alpha) + words * alpha, 2, 40), samples: Math.min(500, profile.samples + 1) };
      saveProfile(profile);
    };

    const dispatchSettled = (turn: SettledTurn) => {
      updateWordsProfile(turn.text);
      window.dispatchEvent(new CustomEvent<TranscriptDetail>(EVENT_NAME, {
        detail: { text: turn.text, settled: true, settle_ms: turn.elapsed, segment_count: turn.segments, communication_style: { avg_gap_ms: Math.round(profile.avgGapMs), avg_words: Number(profile.avgWords.toFixed(1)), samples: profile.samples } },
      }));
    };

    const drainQueue = () => {
      clearDrainTimer();
      if (!queuedTurns.length) return;
      if (assistantProcessing()) {
        drainTimer = window.setTimeout(drainQueue, 90);
        return;
      }
      const next = queuedTurns.shift();
      if (!next) return;
      dispatchSettled(next);
      if (queuedTurns.length) drainTimer = window.setTimeout(drainQueue, 100);
    };

    const enqueueTurn = (turn: SettledTurn) => {
      if (!turn.text || NON_SEMANTIC.test(splitWake(turn.text).body)) return;
      if (STOP_WORDS.test(turn.text)) {
        queuedTurns = [turn];
      } else {
        queuedTurns.push(turn);
        if (queuedTurns.length > 4) queuedTurns = queuedTurns.slice(-4);
      }
      drainQueue();
    };

    const flush = () => {
      clearSettleTimer();
      if (!pending) return;
      const turn: SettledTurn = { text: pending.trim(), segments: segmentCount, elapsed: firstPendingAt ? Date.now() - firstPendingAt : 0 };
      pending = '';
      segmentCount = 0;
      firstPendingAt = 0;
      enqueueTurn(turn);
    };

    const scheduleFlush = () => {
      clearSettleTimer();
      settleTimer = window.setTimeout(flush, settleDelay(pending, profile, segmentCount));
    };

    const onTranscript = (event: Event) => {
      const custom = event as CustomEvent<TranscriptDetail>;
      if (custom.detail?.settled) return;
      const incoming = String(custom.detail?.text || '').trim();
      if (!incoming) return;
      event.stopImmediatePropagation();
      const body = splitWake(incoming).body;
      if (NON_SEMANTIC.test(body)) return;
      const now = Date.now();
      const gap = lastRawAt ? now - lastRawAt : 0;
      if (pending && gap > 1500) flush();
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

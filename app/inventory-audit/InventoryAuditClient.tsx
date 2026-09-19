'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Button,
  designTokens,
  getInputClasses,
  SectionHeader
} from '@/lib/design-system';
import { AuditService, AuditProduct, ExpiryBatch, FullAuditSession, RecentAuditItem } from '@/lib/services/inventory/auditService';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

// Simple SVG Icons to replace lucide-react for better reliability
const Icons = {
  Search: () => <span className="text-lg">🔍</span>,
  Barcode: ({ size = 24 }: { size?: number }) => <span style={{ fontSize: size }}>🏷️</span>,
  CheckCircle2: ({ size = 20 }: { size?: number }) => <span style={{ fontSize: size }}>✅</span>,
  AlertCircle: ({ size = 20, className = "" }: { size?: number, className?: string }) => <span style={{ fontSize: size }} className={className}>⚠️</span>,
  Plus: ({ size = 18 }: { size?: number }) => <span style={{ fontSize: size }}>➕</span>,
  Trash: ({ size = 16 }: { size?: number }) => <span style={{ fontSize: size }}>🗑️</span>,
  Mic: ({ size = 18, className = "" }: { size?: number, className?: string }) => <span style={{ fontSize: size }} className={className}>🎤</span>,
  History: ({ size = 16 }: { size?: number }) => <span style={{ fontSize: size }}>🕒</span>,
  Package: ({ size = 40 }: { size?: number }) => <span style={{ fontSize: size }}>📦</span>,
  X: () => <span>✕</span>
};

type AuditStep = 'scan' | 'select-product' | 'audit-form' | 'create-new' | 'summary';
type Tab = 'audit' | 'idle' | 'newly-found';
type VoiceStage = 'off' | 'waiting-product' | 'quantity' | 'location' | 'pack-size' | 'confirm' | 'saving';
type VoicePackUnit = 'g' | 'kg' | 'ml' | 'l';

type VoiceDraft = {
  quantity: number | null;
  location: string;
  packSizeValue: number | null;
  packSizeUnit: VoicePackUnit | null;
  lastTranscript: string;
};

const EMPTY_VOICE_DRAFT: VoiceDraft = {
  quantity: null,
  location: '',
  packSizeValue: null,
  packSizeUnit: null,
  lastTranscript: '',
};

const NUMBER_WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const parseSpokenNumber = (input: string): number | null => {
  const direct = input.match(/-?\d+(?:\.\d+)?/);
  if (direct) {
    const value = Number(direct[0]);
    return Number.isFinite(value) ? value : null;
  }

  const tokens = input.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let found = false;

  for (const token of tokens) {
    if (token in NUMBER_WORD_VALUES) {
      current += NUMBER_WORD_VALUES[token];
      found = true;
    } else if (token === 'hundred') {
      current = (current || 1) * 100;
      found = true;
    } else if (token === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      found = true;
    }
  }

  return found ? total + current : null;
};

const parseSpokenPackSize = (input: string): { value: number; unit: VoicePackUnit } | null => {
  const text = input.toLowerCase();
  const direct = text.match(/(\d+(?:\.\d+)?)\s*(kg|kilograms?|kilos?|g|grams?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?)\b/);
  const value = direct ? Number(direct[1]) : parseSpokenNumber(text);
  if (value === null || !Number.isFinite(value) || value <= 0) return null;

  let unit: VoicePackUnit | null = null;
  if (/\b(kg|kilograms?|kilos?)\b/.test(text)) unit = 'kg';
  else if (/\b(g|grams?)\b/.test(text)) unit = 'g';
  else if (/\b(ml|millilit(?:er|re)s?)\b/.test(text)) unit = 'ml';
  else if (/\b(l|lit(?:er|re)s?)\b/.test(text)) unit = 'l';

  return unit ? { value, unit } : null;
};

const parseRackLocation = (input: string) => {
  const digitWords: Record<string, string> = {
    zero: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  };
  const ignored = new Set(['rack', 'location', 'bin', 'shelf', 'number', 'no', 'is', 'at', 'in', 'the', 'on']);
  const tokens = input.toLowerCase().replace(/[^a-z0-9-\s]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens
    .filter(token => !ignored.has(token))
    .map(token => digitWords[token] || token)
    .join(' ')
    .trim()
    .toUpperCase();
};

const formatProductSize = (product: {
  weight?: number | null;
  weight_kg?: number | null;
  weight_grams?: number | null;
  unit?: string | null;
  pack_size?: number | null;
  pack_unit?: string | null;
}) => {
  if (product.weight_grams != null && product.weight_grams > 0) {
    return product.weight_grams >= 1000 && product.weight_grams % 1000 === 0
      ? `${product.weight_grams / 1000} kg`
      : `${product.weight_grams} g`;
  }
  if (product.weight_kg != null && product.weight_kg > 0) {
    return product.weight_kg < 1
      ? `${Math.round(product.weight_kg * 1000)} g`
      : `${product.weight_kg} kg`;
  }
  if (product.weight != null && product.weight > 0 && product.unit) {
    const unit = product.unit.toLowerCase();
    // Some older imports stored kilogram-decimal weight while retaining unit='g'
    // (for example 0.14 + g means 140 g). Normalize only that legacy shape.
    if (unit === 'g' && product.weight < 1) return `${Math.round(product.weight * 1000)} g`;
    return `${product.weight} ${product.unit}`;
  }
  if (product.pack_size != null && product.pack_unit) return `${product.pack_size} ${product.pack_unit}`;
  return '';
};

const measurementLabel = (product: AuditProduct | null) => {
  if (!product) return '';
  return formatProductSize(product);
};

const productDisplayName = (product: AuditProduct | null) => {
  if (!product) return '';
  const measure = measurementLabel(product);
  return measure ? `${product.name} · ${measure}` : product.name;
};

const buildAutoSplitBoxes = (
  totalStock: number,
  boxSize: number,
  existing: ExpiryBatch[],
): ExpiryBatch[] => {
  if (totalStock <= 0 || boxSize <= 0) return [];

  const fallbackExpiry = existing.find(batch => batch.expiry_date)?.expiry_date || '';
  const fallbackLot = existing.find(batch => batch.batch_id)?.batch_id || null;
  const fallbackMfg = existing.find(batch => batch.manufacture_date)?.manufacture_date || null;
  const fallbackCarton = existing.find(batch => batch.carton_no)?.carton_no || null;

  const rows: ExpiryBatch[] = [];
  let remaining = totalStock;
  let boxNo = 1;

  while (remaining > 0) {
    const qty = Math.min(boxSize, remaining);
    rows.push({
      batch_id: fallbackLot,
      expiry_date: fallbackExpiry,
      quantity: qty,
      remaining_quantity: qty,
      box_number: boxNo,
      manufacture_date: fallbackMfg,
      carton_no: fallbackCarton,
      label_photo_id: null,
      entry_source: 'auto_split',
    });
    remaining -= qty;
    boxNo += 1;
  }

  return rows;
};

export default function InventoryAuditPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('audit');
  const [step, setStep] = useState<AuditStep>('scan');
  const [scannedGtin, setScannedGtin] = useState('');
  const [currentProduct, setCurrentProduct] = useState<AuditProduct | null>(null);
  const [searchResults, setSearchResults] = useState<AuditProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Hands-free voice audit
  const [handsFreeVoice, setHandsFreeVoice] = useState(false);
  const [voiceStage, setVoiceStage] = useState<VoiceStage>('off');
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft>(EMPTY_VOICE_DRAFT);
  const [voiceStatus, setVoiceStatus] = useState('Voice audit is off.');
  const handsFreeVoiceRef = useRef(false);
  const voiceStageRef = useRef<VoiceStage>('off');
  const voiceDraftRef = useRef<VoiceDraft>(EMPTY_VOICE_DRAFT);
  const voiceRecognitionRef = useRef<any>(null);
  const voiceProductRef = useRef<AuditProduct | null>(null);
  const voiceMediaStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceCaptureGenerationRef = useRef(0);

  // Audit Form State
  const [bins, setBins] = useState<{ location_code: string; stock_quantity: string }[]>([]);
  const [expiryBatches, setExpiryBatches] = useState<ExpiryBatch[]>([]);
  const [savedExpiryDates, setSavedExpiryDates] = useState<string[]>([]);
  const [unitsPerBox, setUnitsPerBox] = useState<string>('');
  const [labelPhotoBusy, setLabelPhotoBusy] = useState(false);
  const [notes, setNotes] = useState('');

  const [isListening, setIsListening] = useState(false);

  const productSizeLabel = (product: AuditProduct | null) => {
    if (!product) return '';
    return formatProductSize(product) || product.unit || '';
  };

  // Lists
  const [unauditedProducts, setUnauditedProducts] = useState<AuditProduct[]>([]);
  const [newlyAddedProducts, setNewlyAddedProducts] = useState<AuditProduct[]>([]);
  const [recentAudits, setRecentAudits] = useState<RecentAuditItem[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [fullAuditSession, setFullAuditSession] = useState<FullAuditSession | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  // Audit Status Notification - using auditStatus consistently
  const [auditStatus, setAuditStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handsFreeVoiceRef.current = handsFreeVoice;
  }, [handsFreeVoice]);

  useEffect(() => {
    voiceStageRef.current = voiceStage;
  }, [voiceStage]);

  useEffect(() => {
    voiceDraftRef.current = voiceDraft;
  }, [voiceDraft]);

  useEffect(() => {
    return () => {
      try { voiceRecognitionRef.current?.abort?.(); } catch {}
      try {
        if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
          voiceRecorderRef.current.stop();
        }
      } catch {}
      voiceMediaStreamRef.current?.getTracks().forEach(track => track.stop());
      voiceMediaStreamRef.current = null;
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, []);

  function setVoiceDraftNow(next: VoiceDraft) {
    voiceDraftRef.current = next;
    setVoiceDraft(next);
  }

  function stopVoiceRecognition() {
    voiceCaptureGenerationRef.current += 1;
    try { voiceRecognitionRef.current?.abort?.(); } catch {}
    voiceRecognitionRef.current = null;
    try {
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        voiceRecorderRef.current.stop();
      }
    } catch {}
    voiceRecorderRef.current = null;
  }

  function speakVoice(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 1.02;
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
  }

  async function listenForVoiceStage(stage: VoiceStage) {
    if (!handsFreeVoiceRef.current || !['quantity', 'location', 'pack-size', 'confirm'].includes(stage)) return;

    stopVoiceRecognition();
    const generation = ++voiceCaptureGenerationRef.current;

    let stream = voiceMediaStreamRef.current;
    if (!stream || stream.getAudioTracks().every(track => track.readyState !== 'live')) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        voiceMediaStreamRef.current = stream;
      } catch {
        setAuditStatus({ type: 'error', text: 'Microphone permission is required for hands-free stock audit.' });
        disableHandsFreeVoice();
        return;
      }
    }

    if (!handsFreeVoiceRef.current || generation !== voiceCaptureGenerationRef.current) return;

    const mimeCandidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    const mimeType = mimeCandidates.find(type =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)
    ) || '';

    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      setAuditStatus({ type: 'error', text: 'This browser cannot record microphone audio for hands-free audit.' });
      disableHandsFreeVoice();
      return;
    }

    voiceRecorderRef.current = recorder;
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const statusText = stage === 'quantity'
      ? 'Listening only for the quantity number…'
      : stage === 'location'
        ? 'Listening for rack / location…'
        : stage === 'pack-size'
          ? 'Listening for pack size, or say skip…'
          : 'Waiting for approve, save, cancel, or a correction…';
    setVoiceStatus(statusText);

    let audioContext: AudioContext | null = null;
    let monitor: number | null = null;
    let hardStop: number | null = null;

    const stopRecorderSafely = () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {}
    };

    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextCtor) {
        audioContext = new AudioContextCtor();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        const startedAt = Date.now();
        let speechStarted = false;
        let quietSince = 0;

        monitor = window.setInterval(() => {
          if (
            generation !== voiceCaptureGenerationRef.current ||
            !handsFreeVoiceRef.current ||
            voiceStageRef.current !== stage
          ) {
            stopRecorderSafely();
            return;
          }

          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i += 1) {
            const normalized = (samples[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / samples.length);
          const now = Date.now();

          if (rms > 0.032) {
            speechStarted = true;
            quietSince = 0;
          } else if (speechStarted) {
            quietSince = quietSince || now;
            if (now - quietSince > 850 && now - startedAt > 900) {
              stopRecorderSafely();
            }
          }

          // If nothing was spoken, retry rather than hanging forever.
          if (!speechStarted && now - startedAt > 4500) stopRecorderSafely();
          if (now - startedAt > 7000) stopRecorderSafely();
        }, 100);
      }

      hardStop = window.setTimeout(stopRecorderSafely, 7200);
      recorder.start(200);
    } catch {
      if (monitor) window.clearInterval(monitor);
      if (hardStop) window.clearTimeout(hardStop);
      try { await audioContext?.close(); } catch {}
      setVoiceStatus('Could not start microphone capture. Retrying…');
      if (handsFreeVoiceRef.current && voiceStageRef.current === stage) {
        window.setTimeout(() => listenForVoiceStage(stage), 800);
      }
      return;
    }

    recorder.onstop = async () => {
      if (monitor) window.clearInterval(monitor);
      if (hardStop) window.clearTimeout(hardStop);
      try { await audioContext?.close(); } catch {}
      if (voiceRecorderRef.current === recorder) voiceRecorderRef.current = null;

      if (
        !handsFreeVoiceRef.current ||
        generation !== voiceCaptureGenerationRef.current ||
        voiceStageRef.current !== stage
      ) return;

      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      if (blob.size < 900) {
        setVoiceStatus('No clear speech heard. Listening again…');
        window.setTimeout(() => listenForVoiceStage(stage), 500);
        return;
      }

      setVoiceStatus('Understanding what you said…');
      const result = await AuditService.transcribeVoiceClip(
        blob,
        stage as 'quantity' | 'location' | 'pack-size' | 'confirm',
      );

      if (
        !handsFreeVoiceRef.current ||
        generation !== voiceCaptureGenerationRef.current ||
        voiceStageRef.current !== stage
      ) return;

      if (!result || !result.normalized) {
        const retryPrompt = stage === 'quantity'
          ? 'I did not catch a quantity. Say only the number, for example twenty five.'
          : stage === 'location'
            ? 'I did not catch the rack. Say the rack or location, for example B 2 3.'
            : stage === 'pack-size'
              ? 'I did not catch the pack size. Say 500 grams, 1 litre, or say skip.'
              : 'I did not catch that. Say approve, save, cancel, or a correction.';
        promptHandsFree(stage, retryPrompt);
        return;
      }

      handleHandsFreeTranscript(stage, result.normalized, result.transcript);
    };
  }

  function promptHandsFree(stage: VoiceStage, prompt: string) {
    if (!handsFreeVoiceRef.current) return;
    voiceStageRef.current = stage;
    setVoiceStage(stage);
    setVoiceStatus(prompt);
    stopVoiceRecognition();
    speakVoice(prompt, () => {
      if (handsFreeVoiceRef.current && voiceStageRef.current === stage) {
        window.setTimeout(() => listenForVoiceStage(stage), 180);
      }
    });
  }

  function voicePackLabel(draft: VoiceDraft, product: AuditProduct) {
    if (draft.packSizeValue && draft.packSizeUnit) return `${draft.packSizeValue} ${draft.packSizeUnit}`;
    return productSizeLabel(product) || 'not changed';
  }

  function presentHandsFreeSummary(product: AuditProduct, draft: VoiceDraft) {
    const summary = `${product.name}. Brand ${product.brand || 'not set'}. Quantity ${draft.quantity ?? 0}. Rack ${draft.location || 'not set'}. Pack size ${voicePackLabel(draft, product)}. Say approve or save to save this audit. Say cancel to discard.`;
    promptHandsFree('confirm', summary);
  }

  async function saveHandsFreeAudit(product: AuditProduct, draft: VoiceDraft) {
    if (draft.quantity === null || draft.quantity < 0 || !draft.location) {
      promptHandsFree('quantity', 'The voice draft is incomplete. Say the quantity number.');
      return;
    }

    voiceStageRef.current = 'saving';
    setVoiceStage('saving');
    setVoiceStatus('Saving the confirmed voice audit…');
    stopVoiceRecognition();
    const { data: { user } } = await supabase.auth.getUser();

    let packSizeSaved = true;
    if (draft.packSizeValue && draft.packSizeUnit) {
      packSizeSaved = await AuditService.updateProductPackSize(
        product.id,
        draft.packSizeValue,
        draft.packSizeUnit,
      );
    }

    const success = await AuditService.performAudit({
      productId: product.id,
      totalStock: draft.quantity,
      bins: [{ location_code: draft.location, stock_quantity: draft.quantity }],
      notes: 'Hands-free voice stock audit',
      userId: user?.id,
      gtin: scannedGtin || product.gtin || undefined,
    });

    if (!success) {
      setAuditStatus({ type: 'error', text: 'Hands-free audit could not be saved. Nothing was auto-approved.' });
      promptHandsFree('confirm', 'Save failed. Say approve to retry, or cancel.');
      return;
    }

    setAuditStatus({
      type: 'success',
      text: packSizeSaved
        ? `Voice audit saved for ${productDisplayName(product)}.`
        : `Stock audit saved for ${productDisplayName(product)}, but the spoken pack size could not be updated.`,
    });

    loadUnaudited();
    loadFullAuditSession();
    loadRecentAudits();

    resetAudit();
    const empty = { ...EMPTY_VOICE_DRAFT };
    setVoiceDraftNow(empty);
    voiceStageRef.current = 'waiting-product';
    setVoiceStage('waiting-product');
    setVoiceStatus('Saved. Ready for the next barcode / QR.');

    speakVoice('Saved. Scan the next barcode or QR code.', () => {
      if (handsFreeVoiceRef.current) setShowScanner(true);
    });
  }

  function handleHandsFreeTranscript(stage: VoiceStage, transcript: string, heardText?: string) {
    if (!handsFreeVoiceRef.current) return;
    const text = transcript.trim();
    const lower = text.toLowerCase();
    const base = { ...voiceDraftRef.current, lastTranscript: (heardText || text).trim() };

    if (stage === 'quantity') {
      const quantity = parseSpokenNumber(text);
      if (quantity === null || quantity < 0) {
        promptHandsFree('quantity', 'I only need the quantity number. For example, say twenty five.');
        return;
      }
      const next = { ...base, quantity: Math.round(quantity) };
      setVoiceDraftNow(next);
      setBins([{ location_code: '', stock_quantity: String(Math.round(quantity)) }]);
      promptHandsFree('location', `Quantity ${Math.round(quantity)}. Now say the rack or location, for example B 2 3.`);
      return;
    }

    if (stage === 'location') {
      const location = parseRackLocation(text);
      if (!location) {
        promptHandsFree('location', 'I only need the rack or location. For example, say B 2 3.');
        return;
      }
      const next = { ...base, location };
      setVoiceDraftNow(next);
      setBins([{ location_code: location, stock_quantity: String(next.quantity ?? 0) }]);
      promptHandsFree('pack-size', `Rack ${location}. Say the product pack size, for example 250 grams, or say skip.`);
      return;
    }

    if (stage === 'pack-size') {
      if (/\b(skip|same|current|unchanged|no change)\b/.test(lower)) {
        const next = { ...base, packSizeValue: null, packSizeUnit: null };
        setVoiceDraftNow(next);
        if (voiceProductRef.current) presentHandsFreeSummary(voiceProductRef.current, next);
        return;
      }

      const parsed = parseSpokenPackSize(text);
      if (!parsed) {
        promptHandsFree('pack-size', 'Say the pack size with a unit, like 250 grams or 1 litre, or say skip.');
        return;
      }
      const next = { ...base, packSizeValue: parsed.value, packSizeUnit: parsed.unit };
      setVoiceDraftNow(next);
      if (voiceProductRef.current) presentHandsFreeSummary(voiceProductRef.current, next);
      return;
    }

    if (stage === 'confirm') {
      if (/\b(approve|approved|save|yes|confirm|confirmed|okay|ok)\b/.test(lower)) {
        if (voiceProductRef.current) void saveHandsFreeAudit(voiceProductRef.current, base);
        return;
      }

      if (/\b(cancel|discard|skip product|next product)\b/.test(lower)) {
        resetAudit();
        setVoiceDraftNow({ ...EMPTY_VOICE_DRAFT });
        voiceStageRef.current = 'waiting-product';
        setVoiceStage('waiting-product');
        setVoiceStatus('Cancelled. Ready for the next barcode / QR.');
        speakVoice('Cancelled. Scan the next barcode or QR code.', () => {
          if (handsFreeVoiceRef.current) setShowScanner(true);
        });
        return;
      }

      if (/\b(quantity|qty|count)\b/.test(lower)) {
        const quantity = parseSpokenNumber(text);
        if (quantity !== null && quantity >= 0) {
          const next = { ...base, quantity: Math.round(quantity) };
          setVoiceDraftNow(next);
          setBins([{ location_code: next.location, stock_quantity: String(next.quantity) }]);
          if (voiceProductRef.current) presentHandsFreeSummary(voiceProductRef.current, next);
          return;
        }
      }

      if (/\b(rack|location|bin|shelf)\b/.test(lower)) {
        const location = parseRackLocation(text);
        if (location) {
          const next = { ...base, location };
          setVoiceDraftNow(next);
          setBins([{ location_code: location, stock_quantity: String(next.quantity ?? 0) }]);
          if (voiceProductRef.current) presentHandsFreeSummary(voiceProductRef.current, next);
          return;
        }
      }

      if (/\b(pack|size|gram|kilogram|kilo|litre|liter|ml)\b/.test(lower)) {
        const parsed = parseSpokenPackSize(text);
        if (parsed) {
          const next = { ...base, packSizeValue: parsed.value, packSizeUnit: parsed.unit };
          setVoiceDraftNow(next);
          if (voiceProductRef.current) presentHandsFreeSummary(voiceProductRef.current, next);
          return;
        }
      }

      promptHandsFree('confirm', 'Say approve or save to save. Say cancel, or say change quantity, rack, or pack size.');
    }
  }

  async function enableHandsFreeVoice() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAuditStatus({ type: 'error', text: 'Hands-free voice recording is not supported on this browser.' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      voiceMediaStreamRef.current?.getTracks().forEach(track => track.stop());
      voiceMediaStreamRef.current = stream;
    } catch {
      setAuditStatus({ type: 'error', text: 'Microphone permission is required for hands-free stock audit.' });
      return;
    }

    handsFreeVoiceRef.current = true;
    setHandsFreeVoice(true);
    const empty = { ...EMPTY_VOICE_DRAFT };
    setVoiceDraftNow(empty);
    voiceStageRef.current = 'waiting-product';
    setVoiceStage('waiting-product');
    setVoiceStatus('Hands-free mode active. Scan a barcode / QR first.');
    speakVoice('Hands free stock audit started. Scan the first barcode or QR code.', () => setShowScanner(true));
  }

  function disableHandsFreeVoice() {
    handsFreeVoiceRef.current = false;
    setHandsFreeVoice(false);
    voiceStageRef.current = 'off';
    setVoiceStage('off');
    setVoiceDraftNow({ ...EMPTY_VOICE_DRAFT });
    setVoiceStatus('Voice audit is off.');
    stopVoiceRecognition();
    voiceMediaStreamRef.current?.getTracks().forEach(track => track.stop());
    voiceMediaStreamRef.current = null;
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }

  function startGuidedVoiceForProduct(product: AuditProduct) {
    if (!handsFreeVoiceRef.current) return;
    const empty = { ...EMPTY_VOICE_DRAFT };
    setVoiceDraftNow(empty);
    const productIntro = [
      `Found ${product.name}`,
      product.brand ? `brand ${product.brand}` : null,
      productSizeLabel(product) ? `size ${productSizeLabel(product)}` : null,
    ].filter(Boolean).join(', ');
    promptHandsFree('quantity', `${productIntro}. Say the physical quantity number.`);
  }

  // Voice Search Handler
  const startVoiceSearch = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Voice recognition not supported in this browser.");
      return;
    }

    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      performSearch(transcript);
    };

    recognition.start();
  };

  // Focus scan input on mount and after actions
  useEffect(() => {
    if (step === 'scan' && activeTab === 'audit') {
      scanInputRef.current?.focus();
    }
  }, [step, activeTab]);

  const loadUnaudited = useCallback(async () => {
    const data = await AuditService.getUnauditedProducts(7); // Audited more than 7 days ago
    setUnauditedProducts(data);
  }, []);

  const loadFullAuditSession = useCallback(async () => {
    const session = await AuditService.getOpenFullAuditSession();
    setFullAuditSession(session);
  }, []);

  const loadRecentAudits = useCallback(async () => {
    const items = await AuditService.getRecentAuditItems(2);
    setRecentAudits(items);
  }, []);

  useEffect(() => {
    loadUnaudited();
    loadFullAuditSession();
    loadRecentAudits();
  }, [loadUnaudited, loadFullAuditSession, loadRecentAudits]);

  const handleStartFullAudit = async () => {
    setSessionBusy(true);
    const session = await AuditService.startFullAudit('Full physical stock audit');
    setSessionBusy(false);
    if (!session) {
      setAuditStatus({ type: 'error', text: 'Could not start the full stock audit session.' });
      return;
    }
    setFullAuditSession(session);
    setAuditStatus({
      type: 'success',
      text: `Full audit started. ${session.snapshot_product_count} products with system stock are waiting to be physically counted.`,
    });
  };

  const handleFinalizeFullAudit = async () => {
    if (!fullAuditSession) return;
    const confirmed = window.confirm(
      'Finalize this full stock audit? Any product with positive system stock that was not counted will be set to zero, unpublished and held for confirmation.'
    );
    if (!confirmed) return;

    setSessionBusy(true);
    const missingCount = await AuditService.finalizeFullAudit(fullAuditSession.id);
    setSessionBusy(false);
    if (missingCount === null) {
      setAuditStatus({ type: 'error', text: 'Could not finalize the full stock audit.' });
      return;
    }

    setFullAuditSession(null);
    setAuditStatus({
      type: 'success',
      text: `Audit finalized. ${missingCount} uncounted product${missingCount === 1 ? '' : 's'} moved to zero stock and unpublished pending confirmation.`,
    });
    loadUnaudited();
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedGtin) return;

    setIsLoading(true);
    const product = await AuditService.findProductByGTIN(scannedGtin);
    setIsLoading(false);

    if (product) {
      handleProductSelect(product);
    } else {
      setStep('select-product');
      setSearchQuery('');
    }
  };

  const handleProductSelect = async (product: AuditProduct) => {
    // If this screen was reached from an unknown physical barcode, choosing an
    // existing product is the confirmation that the barcode belongs to it.
    // Remember it immediately instead of waiting until the audit is saved.
    if (scannedGtin) {
      const barcodeRemembered = await AuditService.assignProductBarcode(product.id, scannedGtin);
      if (!barcodeRemembered) {
        setAuditStatus({
          type: 'error',
          text: 'This barcode could not be assigned. It may already belong to another product. Nothing was changed.',
        });
        return;
      }
    }

    voiceProductRef.current = product;
    setCurrentProduct(product);

    // Blind audit rule: never preload system stock/location/box quantities.
    // Expiry DATE values are safe to remember because they do not reveal the stock count.
    setBins([{ location_code: '', stock_quantity: '' }]);
    setExpiryBatches([]);
    setSavedExpiryDates([]);
    setUnitsPerBox(product.units_per_box ? String(product.units_per_box) : '');
    setNotes('');
    setStep('audit-form');

    const dates = await AuditService.getSavedExpiryDates(product.id);
    setSavedExpiryDates(dates);

    if (handsFreeVoiceRef.current) {
      startGuidedVoiceForProduct(product);
    }
  };

  const performSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await AuditService.searchProductsByName(query);
    setSearchResults(results);
    setIsSearching(false);
  };

  const addBin = () => {
    setBins([...bins, { location_code: '', stock_quantity: '' }]);
  };

  const removeBin = (index: number) => {
    setBins(bins.filter((_, i) => i !== index));
  };

  const updateBin = (index: number, field: 'location_code' | 'stock_quantity', value: string) => {
    const newBins = [...bins];
    newBins[index][field] = value;
    setBins(newBins);

    if (
      field === 'stock_quantity' &&
      expiryBatches.length > 0 &&
      expiryBatches.every(batch => batch.entry_source === 'auto_split')
    ) {
      const boxSize = Math.max(0, parseInt(unitsPerBox, 10) || 0);
      const totalStock = newBins.reduce(
        (sum, bin) => sum + Math.max(0, parseInt(bin.stock_quantity, 10) || 0),
        0,
      );
      setExpiryBatches(buildAutoSplitBoxes(totalStock, boxSize, expiryBatches));
    }
  };

  const addExpiryBatch = () => {
    const rememberedDate = savedExpiryDates.length === 1 ? savedExpiryDates[0] : '';
    setExpiryBatches([...expiryBatches, {
      batch_id: null,
      expiry_date: rememberedDate,
      quantity: 0,
      remaining_quantity: 0,
      box_number: expiryBatches.length + 1,
      manufacture_date: null,
      carton_no: null,
      label_photo_id: null,
      entry_source: 'manual',
    }]);
  };

  const applySavedExpiryDate = (date: string) => {
    if (expiryBatches.length === 0) {
      setExpiryBatches([{
        batch_id: null,
        expiry_date: date,
        quantity: 0,
        remaining_quantity: 0,
        box_number: 1,
        manufacture_date: null,
        carton_no: null,
        label_photo_id: null,
        entry_source: 'manual',
      }]);
      return;
    }

    const next = [...expiryBatches];
    let target = next.findIndex(batch => !batch.expiry_date);
    if (target < 0) target = next.length - 1;
    next[target] = { ...next[target], expiry_date: date };
    setExpiryBatches(next);
  };

  const handleLabelPhoto = async (file: File | null) => {
    if (!currentProduct || !file) return;
    if (!file.type.startsWith('image/')) {
      setAuditStatus({ type: 'error', text: 'Please choose a box/carton label photo.' });
      return;
    }

    setLabelPhotoBusy(true);
    const uploaded = await AuditService.uploadAndAnalyzeLabelPhoto(currentProduct.id, file);
    setLabelPhotoBusy(false);

    if (!uploaded) {
      setAuditStatus({ type: 'error', text: 'Could not upload the label photo.' });
      return;
    }

    const extracted = uploaded.extraction;
    if (!extracted) {
      setAuditStatus({
        type: 'success',
        text: 'Photo saved as audit evidence. Label details could not be read automatically, so enter them manually.',
      });
      return;
    }

    const rememberedDate =
      extracted.expiry_date ||
      (savedExpiryDates.length === 1 ? savedExpiryDates[0] : '');

    const nextBox: ExpiryBatch = {
      batch_id: extracted.batch_code || null,
      expiry_date: rememberedDate,
      quantity: extracted.pack_count || 0,
      remaining_quantity: extracted.pack_count || 0,
      box_number: expiryBatches.length + 1,
      manufacture_date: extracted.manufacture_date || null,
      carton_no: extracted.carton_no || null,
      label_photo_id: uploaded.photo_id,
      entry_source: 'photo',
    };

    setExpiryBatches(prev => [...prev, nextBox]);

    if (extracted.pack_count && !unitsPerBox) {
      setUnitsPerBox(String(extracted.pack_count));
    }
    if (extracted.expiry_date) {
      setSavedExpiryDates(prev => [...new Set([...prev, extracted.expiry_date as string])].sort());
    }

    const details = [
      extracted.batch_code ? `batch ${extracted.batch_code}` : null,
      extracted.expiry_date ? `expiry ${extracted.expiry_date}` : null,
      extracted.pack_count ? `${extracted.pack_count} packs` : null,
      extracted.carton_no ? `carton ${extracted.carton_no}` : null,
    ].filter(Boolean).join(' · ');

    setAuditStatus({
      type: 'success',
      text: details ? `Photo read: ${details}. Please verify before saving.` : 'Photo attached. Please verify the box details before saving.',
    });
  };

  const splitStockIntoBoxes = () => {
    const boxSize = Math.max(0, parseInt(unitsPerBox, 10) || 0);
    const totalStock = bins.reduce(
      (sum, bin) => sum + Math.max(0, parseInt(bin.stock_quantity, 10) || 0),
      0,
    );

    if (boxSize <= 0) {
      setAuditStatus({ type: 'error', text: 'Enter Pieces per box first.' });
      return;
    }
    if (totalStock <= 0) {
      setAuditStatus({ type: 'error', text: 'Enter the physical stock quantity first.' });
      return;
    }

    const rows = buildAutoSplitBoxes(totalStock, boxSize, expiryBatches);
    setExpiryBatches(rows);

    const lastQty = rows.at(-1)?.quantity || 0;
    const partialText = lastQty < boxSize ? ` Last box is partial with ${lastQty} pieces.` : '';
    setAuditStatus({
      type: 'success',
      text: `Split ${totalStock} physical pieces into ${rows.length} box${rows.length === 1 ? '' : 'es'} with capacity ${boxSize} each.${partialText}`,
    });
  };

  const removeExpiryBatch = (index: number) => {
    setExpiryBatches(
      expiryBatches
        .filter((_, i) => i !== index)
        .map(batch => ({ ...batch, entry_source: 'manual' as const })),
    );
  };

  const updateExpiryBatch = (
    index: number,
    field: 'batch_id' | 'expiry_date' | 'quantity' | 'manufacture_date' | 'carton_no',
    value: string,
  ) => {
    const next = [...expiryBatches];
    if (field === 'quantity') {
      next[index] = {
        ...next[index],
        quantity: Math.max(0, parseInt(value, 10) || 0),
        entry_source: 'manual',
      };
    } else {
      next[index] = {
        ...next[index],
        [field]: value || (field === 'expiry_date' ? '' : null),
      } as ExpiryBatch;
    }
    setExpiryBatches(next);
  };

  const handleAuditSubmit = async () => {
    if (!currentProduct) return;

    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const formattedBins = bins.map(b => ({
      location_code: b.location_code,
      stock_quantity: parseInt(b.stock_quantity) || 0
    }));

    const totalStock = formattedBins.reduce((sum, b) => sum + b.stock_quantity, 0);
    const expiryTotal = expiryBatches.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity) || 0), 0);
    const nonZeroExpiryBatches = expiryBatches.filter(batch => Math.max(0, Number(batch.quantity) || 0) > 0);

    if (nonZeroExpiryBatches.some(batch => !batch.expiry_date)) {
      setAuditStatus({ type: 'error', text: 'Every expiry batch with stock needs an expiry date.' });
      setIsLoading(false);
      return;
    }

    if (nonZeroExpiryBatches.length > 0 && expiryTotal !== totalStock) {
      setAuditStatus({
        type: 'error',
        text: `Box pieces total (${expiryTotal}) must match the physical count (${totalStock}). “Pieces per box” is only the carton capacity. Use Split stock into boxes, or enter the actual pieces remaining in each box.`,
      });
      setIsLoading(false);
      return;
    }

    const success = await AuditService.performAudit({
      productId: currentProduct.id,
      totalStock: totalStock,
      bins: formattedBins,
      // In blind mode, an empty box section means "not re-audited", not "delete old expiry data".
      expiryBatches: expiryBatches.length > 0 ? expiryBatches : undefined,
      unitsPerBox: unitsPerBox ? Math.max(1, parseInt(unitsPerBox, 10) || 1) : null,
      notes: notes,
      userId: user?.id,
      gtin: scannedGtin // Update GTIN if it was scanned and assigned
    });

    setIsLoading(false);

    if (success) {
      setAuditStatus({ type: 'success', text: `Audited ${productDisplayName(currentProduct)} across ${bins.length} locations.` });
      resetAudit();
      loadUnaudited();
      loadFullAuditSession();
      loadRecentAudits();
    } else {
      setAuditStatus({ type: 'error', text: 'Failed to save audit data.' });
    }
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.target as any).name.value;
    if (!name) return;

    setIsLoading(true);
    const product = await AuditService.quickCreateProduct(name, scannedGtin);
    setIsLoading(false);

    if (product) {
      setNewlyAddedProducts(prev => [product, ...prev]);
      handleProductSelect(product);
    } else {
      setAuditStatus({ type: 'error', text: 'Failed to create product.' });
    }
  };

  const resetAudit = () => {
    setStep('scan');
    setScannedGtin('');
    voiceProductRef.current = null;
    setCurrentProduct(null);
    setBins([]);
    setExpiryBatches([]);
    setSavedExpiryDates([]);
    setUnitsPerBox('');
    setLabelPhotoBusy(false);
    setNotes('');
    setSearchResults([]);
    if (!handsFreeVoiceRef.current) {
      setVoiceDraftNow({ ...EMPTY_VOICE_DRAFT });
      voiceStageRef.current = 'off';
      setVoiceStage('off');
      setVoiceStatus('Voice audit is off.');
    }
  };

  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="📋"
          title="Inventory Audit"
          subtitle="Physical stock verification & location tracking"
          action={
            <Link href="/inventory-management/reports/audit">
              <Button variant="secondary">
                <span className="mr-2">📊</span> View Audit Report
              </Button>
            </Link>
          }
        />

        <Card variant="glass" className="mb-6 border-cyan-500/20">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-black text-cyan-400">Full Stock Audit Session</p>
                {fullAuditSession ? (
                  <>
                    <p className="text-sm font-bold text-slate-100 mt-1">Audit is open — scan/count the full physical stock before finalising.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Started {new Date(fullAuditSession.started_at).toLocaleString('en-GB')} ·
                      Snapshot {fullAuditSession.snapshot_product_count} ·
                      Counted {fullAuditSession.counted_product_count}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-100 mt-1">No full audit is currently open.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Start a full audit before stock counting if you want uncounted system stock to be automatically quarantined at the end.
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {fullAuditSession ? (
                  <>
                    <Link
                      href="/inventory-management/reports/audit"
                      className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black uppercase text-slate-200"
                    >
                      Review Report
                    </Link>
                    <button
                      type="button"
                      onClick={handleFinalizeFullAudit}
                      disabled={sessionBusy}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black uppercase disabled:opacity-50"
                    >
                      {sessionBusy ? 'Finalising…' : 'Finalize Full Audit'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartFullAudit}
                    disabled={sessionBusy}
                    className="px-4 py-2.5 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase disabled:opacity-50"
                  >
                    {sessionBusy ? 'Starting…' : 'Start Full Audit'}
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-slate-900/40 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'audit', label: 'Start Audit', icon: Icons.Barcode },
            { id: 'idle', label: 'Idle Products', icon: Icons.History },
            { id: 'newly-found', label: 'New Finds', icon: Icons.Plus },
          ].map(({ icon: TabIcon, ...tab }) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <TabIcon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {auditStatus && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 border ${
            auditStatus.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            {auditStatus.type === 'success' ? <Icons.CheckCircle2 size={20} /> : <Icons.AlertCircle size={20} />}
            <span className="text-sm font-medium">{auditStatus.text}</span>
            <button onClick={() => setAuditStatus(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <div className={designTokens.spacing.section}>

          {activeTab === 'audit' && (
            <div className="space-y-6">

              {/* Recent audited products — persisted from audit logs so progress survives navigation/reload */}
              {step === 'scan' && recentAudits.length > 0 && (
                <Card variant="glass" className="border-blue-500/20">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[10px] text-blue-400 uppercase font-black tracking-[0.18em]">Where you stopped</p>
                        <p className="text-xs text-slate-500 mt-1">Last two completed stock-audit scans</p>
                      </div>
                      <Icons.History size={18} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {recentAudits.map((item, index) => {
                        const size = formatProductSize(item) || item.unit || '—';

                        return (
                          <div
                            key={item.log_id}
                            className={`rounded-2xl border p-3.5 ${
                              index === 0
                                ? 'border-cyan-500/30 bg-cyan-500/5'
                                : 'border-slate-800 bg-slate-900/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                  {index === 0 ? 'Last scanned' : 'Previous'}
                                </p>
                                <p className="font-black text-slate-100 mt-1 truncate">{item.name}</p>
                                <p className="text-xs text-cyan-300 font-bold mt-0.5">{size}</p>
                              </div>
                              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                {new Date(item.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-3 py-2">
                                <p className="text-[9px] uppercase font-black text-slate-600">Qty</p>
                                <p className="text-lg font-black text-white">{item.quantity}</p>
                              </div>
                              <div className="rounded-xl bg-slate-950/50 border border-slate-800 px-3 py-2">
                                <p className="text-[9px] uppercase font-black text-slate-600">Location</p>
                                <p className="text-sm font-black text-white truncate">{item.warehouse_location || 'Unassigned'}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 1: Scan Barcode */}
              {step === 'scan' && (
                <Card>
                  <CardContent className="py-12">
                    <div className="max-w-md mx-auto text-center">
                      <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
                        <Icons.Barcode size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Scan Product Barcode</h3>
                      <p className="text-slate-400 mb-8">Scan the barcode to identify the product. Existing system stock and location stay hidden while you count.</p>

                      <div className="space-y-4">
                        {!handsFreeVoice ? (
                          <button
                            type="button"
                            onClick={() => void enableHandsFreeVoice()}
                            className="w-full py-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-100 font-black text-sm uppercase tracking-wider"
                          >
                            🎙️ Start Hands-Free Voice Audit
                          </button>
                        ) : (
                          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-left">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.18em] font-black text-emerald-300">Hands-Free Active</p>
                                <p className="text-sm text-slate-200 mt-1">{voiceStatus}</p>
                                <p className="text-[10px] text-slate-500 mt-2">Barcode/QR identifies the product first. Voice cannot switch products by name.</p>
                              </div>
                              <button
                                type="button"
                                onClick={disableHandsFreeVoice}
                                className="px-3 py-2 rounded-xl border border-slate-700 text-xs font-black text-slate-300"
                              >
                                Stop Voice
                              </button>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => setShowScanner(true)}
                          className="w-full py-6 bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-3xl font-black text-lg uppercase tracking-widest shadow-xl shadow-cyan-900/20 active:scale-[0.98] transition-all flex flex-col items-center gap-2"
                        >
                          <span className="text-3xl">📷</span>
                          Open Camera Scanner
                        </button>

                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-slate-800"></div>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">or enter manually</span>
                          <div className="h-px flex-1 bg-slate-800"></div>
                        </div>

                        <form onSubmit={handleScan} className="relative">
                          <input
                            ref={scanInputRef}
                            type="text"
                            placeholder="Type barcode ID..."
                            value={scannedGtin}
                            onChange={(e) => setScannedGtin(e.target.value)}
                            className={`w-full text-center text-xl font-mono tracking-widest py-4 ${getInputClasses()}`}
                          />
                          {isLoading && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          <Button type="submit" variant="primary" className="w-full mt-4" disabled={!scannedGtin || isLoading}>
                            Lookup Product
                          </Button>
                        </form>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Product Not Found - Select or Create */}
              {step === 'select-product' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icons.AlertCircle className="text-amber-500" />
                      GTIN Not Found: {scannedGtin}
                    </CardTitle>
                    <CardDescription>
                      Choose the correct existing product once. CentralHub will remember this barcode immediately for future scans, or create a new entry.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Icons.Search />
                        </div>
                        <input
                          type="text"
                          placeholder="Search product name, brand or category..."
                          className={`w-full pl-10 pr-12 ${getInputClasses()}`}
                          value={searchQuery}
                          onChange={(e) => performSearch(e.target.value)}
                        />
                        <button
                          onClick={startVoiceSearch}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-slate-800 text-slate-400'}`}
                        >
                          <Icons.Mic size={20} />
                        </button>
                      </div>

                      {isSearching ? (
                         <div className="py-12 text-center">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-slate-400">Searching catalog...</p>
                         </div>
                      ) : searchResults.length > 0 ? (
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                          {searchResults.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleProductSelect(p)}
                              className="w-full flex items-center justify-between p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800 hover:border-blue-500/50 transition-all text-left group"
                            >
                              <div className="min-w-0">
                                <p className="text-slate-200 font-medium truncate">{productDisplayName(p)}</p>
                                <p className="text-xs text-slate-500">{p.brand || 'No Brand'} · {p.category || 'No Category'}</p>
                              </div>
                              <Icons.Plus />
                            </button>
                          ))}
                        </div>
                      ) : searchQuery.length >= 2 ? (
                        <div className="py-8 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
                          <p className="text-slate-400">No products match &quot;{searchQuery}&quot;</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="pt-6 border-t border-slate-800">
                      <SectionHeader title="Or Create New Product" subtitle="Add a basic entry now, add more details later" />
                      <form onSubmit={handleQuickCreate} className="mt-4 flex gap-2">
                        <input
                          name="name"
                          type="text"
                          placeholder="Product Name..."
                          className={`flex-1 ${getInputClasses()}`}
                          required
                        />
                        <Button type="submit" variant="secondary" disabled={isLoading}>
                          <Icons.Plus size={18} />
                        </Button>
                      </form>
                    </div>

                    <Button variant="ghost" className="w-full mt-4" onClick={() => setStep('scan')}>
                      Cancel & Scan Again
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Audit Form */}
              {step === 'audit-form' && currentProduct && (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-xl">{productDisplayName(currentProduct)}</CardTitle>
                      <CardDescription>SKU: {currentProduct.sku || 'N/A'} | GTIN: {scannedGtin || currentProduct.gtin}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] font-black text-cyan-300">Blind Count Mode</p>
                      <p className="text-sm text-slate-300 mt-1">
                        System stock, saved locations and existing expiry-box quantities are hidden. Enter only what you physically see now.
                        The saved audit report will compare your count with the previous system values afterwards.
                      </p>
                    </div>

                    {handsFreeVoice && (
                      <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 overflow-hidden">
                        <div className="px-4 py-3 border-b border-violet-500/15 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] font-black text-violet-300">Voice Capture Table</p>
                            <p className="text-xs text-slate-400 mt-1">{voiceStatus}</p>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-slate-950/50 text-[10px] font-black uppercase text-violet-200">
                            {voiceStage.replace('-', ' ')}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-800/70">
                              <tr>
                                <td className="px-4 py-3 text-slate-500 text-xs font-black uppercase">Product</td>
                                <td className="px-4 py-3 text-slate-100 font-bold">{currentProduct.name}</td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-500 text-xs font-black uppercase">Brand</td>
                                <td className="px-4 py-3 text-slate-200">{currentProduct.brand || '—'}</td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-500 text-xs font-black uppercase">Pack size</td>
                                <td className="px-4 py-3 text-slate-200">
                                  {voiceDraft.packSizeValue && voiceDraft.packSizeUnit
                                    ? `${voiceDraft.packSizeValue} ${voiceDraft.packSizeUnit}`
                                    : productSizeLabel(currentProduct) || '—'}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-500 text-xs font-black uppercase">Quantity</td>
                                <td className="px-4 py-3 text-slate-100 font-black">{voiceDraft.quantity ?? 'Waiting…'}</td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-500 text-xs font-black uppercase">Rack / Location</td>
                                <td className="px-4 py-3 text-slate-100 font-black">{voiceDraft.location || 'Waiting…'}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {voiceDraft.lastTranscript && (
                          <div className="px-4 py-2.5 border-t border-slate-800/70 text-[10px] text-slate-500">
                            Heard: “{voiceDraft.lastTranscript}”
                          </div>
                        )}
                      </div>
                    )}

                    {/* Identity only — no system stock/location shown before submission */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Size</p>
                        <p className="text-sm font-bold text-white">{productSizeLabel(currentProduct) || '—'}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Brand</p>
                        <p className="text-sm font-medium text-slate-300 truncate">{currentProduct.brand || '—'}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Category</p>
                        <p className="text-sm font-medium text-slate-300 truncate">{currentProduct.category || '—'}</p>
                      </div>
                    </div>

                    {/* Audit Inputs */}
                    <div className="space-y-6 pt-4">

                      {/* Expiry Tracking */}
                      <div className="space-y-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <label className={designTokens.typography.label}>Expiry Boxes</label>
                              <p className="text-[10px] text-amber-500 font-medium mt-1">
                                One row = one physical box. All pieces inside that box share the same expiry date.
                              </p>
                            </div>
                            <Button variant="secondary" onClick={addExpiryBatch}>
                              <Icons.Plus size={14} /> Add Box
                            </Button>
                          </div>

                          {savedExpiryDates.length > 0 && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                              <p className="text-[10px] uppercase font-black tracking-widest text-emerald-300">Remembered expiry dates</p>
                              <p className="text-[10px] text-slate-500 mt-1">Dates only are remembered — old stock quantities stay hidden.</p>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {savedExpiryDates.map(date => (
                                  <button
                                    key={date}
                                    type="button"
                                    onClick={() => applySavedExpiryDate(date)}
                                    className="px-3 py-2 rounded-xl border border-emerald-500/25 bg-slate-950/40 text-xs font-black text-emerald-200"
                                  >
                                    {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB')}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase font-black tracking-widest text-violet-300">Box / carton label photo</p>
                                <p className="text-[10px] text-slate-500 mt-1">
                                  Take or upload a label photo. CentralHub can prefill batch, expiry, pack count, manufacture date and carton number.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <label className={`cursor-pointer px-4 py-3 rounded-xl border border-violet-500/30 bg-violet-500/10 text-xs font-black text-violet-200 text-center ${labelPhotoBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                                  {labelPhotoBusy ? 'Reading label…' : '📷 Take Photo'}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    disabled={labelPhotoBusy}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] || null;
                                      void handleLabelPhoto(file);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                </label>
                                <label className={`cursor-pointer px-4 py-3 rounded-xl border border-violet-500/30 bg-slate-950/40 text-xs font-black text-violet-200 text-center ${labelPhotoBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                                  🖼️ Upload Photo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={labelPhotoBusy}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] || null;
                                      void handleLabelPhoto(file);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                            <p className="text-[10px] text-amber-300/80 mt-2">
                              AI extraction is a suggestion only. You confirm the values before the audit is saved.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                            <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3">
                              <label className="text-[10px] text-slate-500 uppercase font-bold">Pieces per box</label>
                              <input
                                type="number"
                                min={1}
                                value={unitsPerBox}
                                onChange={(e) => setUnitsPerBox(e.target.value)}
                                placeholder="e.g. 25"
                                className={`w-full mt-1 text-sm font-bold ${getInputClasses()}`}
                              />
                              <p className="text-[10px] text-slate-500 mt-1">Saved for this SKU and reused next time.</p>
                            </div>
                            <button
                              type="button"
                              onClick={splitStockIntoBoxes}
                              className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs font-black text-amber-300"
                            >
                              Split stock into boxes
                            </button>
                          </div>
                        </div>

                        {expiryBatches.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-700 p-4 text-xs text-slate-500 text-center">
                            No box entered yet. Add each physical box you actually see if the stock has an expiry date.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {expiryBatches.map((batch, index) => (
                              <div key={batch.id || index} className="grid grid-cols-12 gap-2 items-end rounded-xl bg-slate-900/40 border border-slate-800 p-3">
                                <div className="col-span-12 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-widest font-black text-amber-300">
                                      Box {batch.box_number || index + 1}
                                    </span>
                                    {batch.label_photo_id && (
                                      <span className="text-[10px] font-black text-violet-300">📷 Photo attached</span>
                                    )}
                                  </div>
                                  {unitsPerBox && Number(batch.quantity) < Number(unitsPerBox) && (
                                    <span className="text-[10px] font-bold text-slate-500">Partial box</span>
                                  )}
                                </div>
                                <div className="col-span-12 sm:col-span-4 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Lot / batch code (optional)</label>
                                  <input
                                    type="text"
                                    value={batch.batch_id || ''}
                                    onChange={(e) => updateExpiryBatch(index, 'batch_id', e.target.value)}
                                    placeholder="Supplier lot code"
                                    className={`w-full text-sm ${getInputClasses()}`}
                                  />
                                </div>
                                <div className="col-span-7 sm:col-span-5 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Expiry Date</label>
                                  <input
                                    type="date"
                                    value={batch.expiry_date || ''}
                                    onChange={(e) => updateExpiryBatch(index, 'expiry_date', e.target.value)}
                                    className={`w-full text-sm ${getInputClasses()}`}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-2 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Pieces in box</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={batch.quantity}
                                    onChange={(e) => updateExpiryBatch(index, 'quantity', e.target.value)}
                                    className={`w-full text-sm font-bold ${getInputClasses()}`}
                                  />
                                </div>
                                <div className="col-span-6 sm:col-span-3 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Manufacture date</label>
                                  <input
                                    type="date"
                                    value={batch.manufacture_date || ''}
                                    onChange={(e) => updateExpiryBatch(index, 'manufacture_date', e.target.value)}
                                    className={`w-full text-sm ${getInputClasses()}`}
                                  />
                                </div>
                                <div className="col-span-6 sm:col-span-3 space-y-1">
                                  <label className="text-[10px] text-slate-500 uppercase font-bold">Carton no.</label>
                                  <input
                                    type="text"
                                    value={batch.carton_no || ''}
                                    onChange={(e) => updateExpiryBatch(index, 'carton_no', e.target.value)}
                                    placeholder="e.g. 109"
                                    className={`w-full text-sm ${getInputClasses()}`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeExpiryBatch(index)}
                                  className="col-span-1 p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                  aria-label={`Remove expiry batch ${index + 1}`}
                                >
                                  <Icons.Trash size={18} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between rounded-xl bg-slate-900/40 border border-slate-800 px-3 py-2">
                          <span className="text-xs text-slate-500">
                            {expiryBatches.length} box{expiryBatches.length === 1 ? '' : 'es'} · total pieces
                          </span>
                          <span className="font-black text-amber-300">
                            {expiryBatches.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity) || 0), 0)}
                          </span>
                        </div>
                      </div>

                      {/* Multi-Location Bins */}
                      <div className="space-y-4">
                        <SectionHeader
                          title="Stock by Location"
                          subtitle="Enter the physical location(s) you actually find — saved locations are intentionally hidden"
                          action={
                            <Button variant="secondary" onClick={addBin}>
                              <Icons.Plus size={14} /> Add Bin
                            </Button>
                          }
                        />

                        <div className="space-y-3">
                          {bins.map((bin, index) => (
                            <div key={index} className="flex gap-2 items-end bg-slate-900/30 p-3 rounded-xl border border-slate-800">
                              <div className="flex-1 space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Location / Bin</label>
                                <input
                                  type="text"
                                  value={bin.location_code}
                                  onChange={(e) => updateBin(index, 'location_code', e.target.value)}
                                  placeholder="e.g. A1-B2"
                                  className={`w-full text-sm ${getInputClasses()}`}
                                />
                              </div>
                              <div className="w-24 space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Stock</label>
                                <input
                                  type="number"
                                  value={bin.stock_quantity}
                                  onChange={(e) => updateBin(index, 'stock_quantity', e.target.value)}
                                  className={`w-full text-sm font-bold ${getInputClasses()}`}
                                />
                              </div>
                              {bins.length > 1 && (
                                <button
                                  onClick={() => removeBin(index)}
                                  className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                >
                                  <Icons.Trash size={18} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                          <span className="text-sm text-slate-400 font-medium">Physical Count Entered:</span>
                          <span className="text-xl font-bold text-blue-400">
                            {bins.reduce((sum, b) => sum + (parseInt(b.stock_quantity) || 0), 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={designTokens.typography.label}>Audit Notes (Optional)</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={`w-full h-20 ${getInputClasses()}`}
                        placeholder="Any discrepancies or condition notes..."
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-6">
                      <Button variant="primary" className="flex-1 py-4 text-lg" onClick={handleAuditSubmit} disabled={isLoading}>
                        {isLoading ? 'Saving...' : 'Save Audit & Complete'}
                      </Button>
                      <Button variant="secondary" className="px-8" onClick={resetAudit} disabled={isLoading}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          )}

          {activeTab === 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle>Idle Products</CardTitle>
                <CardDescription>Active products that haven&apos;t been audited in the last 7 days.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {unauditedProducts.length > 0 ? (
                    unauditedProducts.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-800/20 border border-slate-700/50">
                        <div>
                          <p className="text-slate-200 font-medium">{productDisplayName(p)}</p>
                          <p className="text-xs text-slate-500">Blind audit ready · system stock and location hidden</p>
                        </div>
                        <Button variant="secondary" onClick={() => {
                          setActiveTab('audit');
                          handleProductSelect(p);
                        }}>
                          Audit Now
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <div className="text-4xl mb-4 opacity-50">✨</div>
                      <p className="text-slate-400">All active products have been audited recently!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'newly-found' && (
            <Card>
              <CardHeader>
                <CardTitle>Newly Found Products</CardTitle>
                <CardDescription>Products added to the catalog during this audit session.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {newlyAddedProducts.length > 0 ? (
                    newlyAddedProducts.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                        <div>
                          <p className="text-slate-200 font-medium">{p.name}</p>
                          <p className="text-xs text-slate-500">GTIN: {p.gtin} | Added Today</p>
                        </div>
                        <Button variant="secondary" onClick={() => {
                          setActiveTab('audit');
                          handleProductSelect(p);
                        }}>
                          Update Details
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <div className="text-4xl mb-4 opacity-30">📦</div>
                      <p className="text-slate-400">No new products added in this session.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(decodedText) => {
            setScannedGtin(decodedText);
            setShowScanner(false);
            // Manually trigger lookup logic
            setIsLoading(true);
            AuditService.findProductByGTIN(decodedText).then(product => {
              setIsLoading(false);
              if (product) {
                handleProductSelect(product);
              } else {
                setStep('select-product');
                setSearchQuery('');
              }
            });
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

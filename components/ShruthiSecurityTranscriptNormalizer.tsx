'use client';

import { useEffect } from 'react';

type TranscriptEvent = CustomEvent<{ text?: string; securityNormalized?: boolean }>;

const SHRUTHI_SECURITY_ALIASES = [
  'shruthi', 'shruti', 'sruthi', 'sruti', 'shrudhi', 'srudhi', 'shroothi', 'shrooti',
  'sudhi', 'sudi', 'suthi', 'shudi', 'shuti', 'sweetie', 'sweety',
  'ശ്രുതി', 'ശ്രൂതി', 'ஸ்ருதி', 'ஸ்ரூதி',
];

const TINU_SECURITY_ALIASES = [
  'tinu', 'tino', 'teenu', 'tenu', 'jinu', 'jino', 'ginu', 'chino', 'cheenu',
];

const IDENTITY_CONNECTOR = /\b(?:this\s+is|i\s+am|i'?m|it\s+is|its|it's)\b/iu;

function isSecurityContext() {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).__centralHubSecurityLocked) || window.location.pathname.startsWith('/login');
}

function includesAlias(text: string, aliases: string[]) {
  const normalized = text.toLowerCase();
  return aliases.some((alias) => normalized.includes(alias.toLowerCase()));
}

function normalizeSecurityTranscript(raw: string) {
  const text = raw.trim();
  if (!text || !IDENTITY_CONNECTOR.test(text)) return '';

  const hasShruthi = includesAlias(text, SHRUTHI_SECURITY_ALIASES) || /\bSHRUTHI\b/.test(text);
  const hasTinu = includesAlias(text, TINU_SECURITY_ALIASES);
  if (!hasShruthi || !hasTinu) return '';

  // The spoken phrase only starts Android biometric/device verification; it is
  // never the authentication factor itself. Normalize Samsung STT substitutions
  // observed on the Fold while keeping the real security boundary unchanged.
  return 'SHRUTHI this is Tinu';
}

export default function ShruthiSecurityTranscriptNormalizer() {
  useEffect(() => {
    const onTranscript = (event: Event) => {
      if (!isSecurityContext()) return;
      const custom = event as TranscriptEvent;
      if (custom.detail?.securityNormalized) return;

      const raw = String(custom.detail?.text || '').trim();
      const canonical = normalizeSecurityTranscript(raw);
      if (!canonical || canonical === raw) return;

      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('centralhub:tara-transcript', {
          detail: {
            text: canonical,
            securityNormalized: true,
          },
        }));
      }, 0);
    };

    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
    return () => window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
  }, []);

  return null;
}

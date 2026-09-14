'use client';

import { useEffect } from 'react';

/** Replays an Android VoiceInteractionService invocation into the existing Shruthi event bus. */
export default function ShruthiSystemInvocationBridge() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('shruthi_wake') !== '1') return;

    const command = (url.searchParams.get('shruthi_command') || 'SHRUTHI').trim() || 'SHRUTHI';
    url.searchParams.delete('shruthi_wake');
    url.searchParams.delete('shruthi_command');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);

    // CentralHubVoiceAssistant is mounted in the same layout. Give its listener a
    // moment to attach after a cold Android launch, then reuse the native transcript path.
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('centralhub:tara-transcript', { detail: { text: command } }));
    }, 800);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}

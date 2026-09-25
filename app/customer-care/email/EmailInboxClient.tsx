'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Email = {
  resend_email_id: string;
  message_id: string | null;
  from_address: string;
  to_addresses: string[];
  subject: string;
  body_text: string | null;
  attachments: { id?: string; filename?: string; content_type?: string }[];
  received_at: string;
  processing_state: 'unread' | 'reviewed' | 'archived';
};

export default function EmailInboxClient() {
  const [messages, setMessages] = useState<Email[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const authorizedRequest = useCallback(async (method: 'GET' | 'PATCH', data?: object) => {
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session.session?.access_token) throw new Error('Please sign in to CentralHub again.');
    const response = await fetch('/api/customer-care/email-inbox', {
      method,
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + session.session.access_token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to access the email inbox.');
    return result;
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const result = await authorizedRequest('GET');
      const list = Array.isArray(result.messages) ? result.messages as Email[] : [];
      setMessages(list);
      setSelected(old => old && list.some(x => x.resend_email_id === old) ? old : list[0]?.resend_email_id || null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load email.'); }
    finally { setLoading(false); }
  }, [authorizedRequest]);

  useEffect(() => { void refresh(); }, [refresh]);

  const update = async (state: Email['processing_state']) => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await authorizedRequest('PATCH', { id: selected, processing_state: state });
      setMessages(old => old.map(m => m.resend_email_id === selected ? { ...m, processing_state: state } : m));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update email.'); }
    finally { setBusy(false); }
  };
  const visible = messages.filter(message =>
    (showArchived || message.processing_state !== 'archived') &&
    (message.subject + ' ' + message.from_address + ' ' + message.to_addresses.join(' ')).toLowerCase().includes(query.toLowerCase())
  );
  const current = messages.find(x => x.resend_email_id === selected) || null;
  const date = (value: string) => Number.isNaN(Date.parse(value)) ? 'Unknown time' : new Date(value).toLocaleString();

  return (
    <section className="flex flex-col h-full min-h-0 bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/90 px-3 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/customer-care/inbox" className="text-xs text-cyan-300 hover:underline">← WhatsApp inbox</Link>
          <h1 className="font-bold text-lg">CentralHub email</h1>
          <p className="text-[11px] text-slate-400">Private inbox · Manual review only · No automatic replies</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">{loading ? 'Loading…' : 'Refresh'}</button>
      </header>
      {error && <div role="alert" className="shrink-0 bg-red-950/40 border-b border-red-900 px-4 py-2 text-sm text-red-200">{error}</div>}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className={'' + (current ? 'hidden md:flex ' : 'flex ') + 'w-full md:w-72 lg:w-80 shrink-0 flex-col border-r border-slate-800 min-h-0'}>
          <div className="shrink-0 p-3 border-b border-slate-800 space-y-2">
            <input aria-label="Search email" placeholder="Search subject or sender" value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white" />
            <label className="flex gap-2 items-center text-xs text-slate-300"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {visible.length === 0 && <div className="p-5 text-sm text-slate-400">{loading ? 'Loading messages…' : 'No matching messages'}</div>}
            {visible.map(m => (
              <button type="button" key={m.resend_email_id} onClick={() => setSelected(m.resend_email_id)}
                className={'block w-full text-left border-b border-slate-800 px-4 py-3 hover:bg-slate-800/70 ' + (selected === m.resend_email_id ? 'bg-cyan-950/40' : '')}>
                <div className="flex justify-between gap-2"><span className="text-sm font-semibold truncate">{m.from_address}</span><span className="text-[10px] text-slate-400 shrink-0">{date(m.received_at)}</span></div>
                <div className="text-sm truncate mt-1">{m.subject || '(No subject)'}</div>
                <div className="text-xs text-slate-400 truncate mt-1">{m.body_text || 'No plain-text body'}</div>
                {m.processing_state === 'unread' && <span className="text-[10px] text-cyan-300">Unread</span>}
              </button>
            ))}
          </div>
        </aside>
        <main className={'' + (current ? 'flex ' : 'hidden md:flex ') + 'flex-1 flex-col min-w-0 min-h-0'}>
          {current ? <>
            <div className="shrink-0 border-b border-slate-800 p-3 sm:p-4 space-y-2">
              <button type="button" className="md:hidden text-xs text-cyan-300" onClick={() => setSelected(null)}>← All emails</button>
              <h2 className="text-lg font-bold break-words">{current.subject || '(No subject)'}</h2>
              <div className="text-xs text-slate-400 break-all">From: {current.from_address}</div>
              <div className="text-xs text-slate-400 break-all">To: {current.to_addresses.join(', ')}</div>
              <div className="text-xs text-slate-400">{date(current.received_at)}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || current.processing_state === 'reviewed'} onClick={() => void update('reviewed')} className="rounded-lg bg-cyan-800 px-3 py-2 text-xs disabled:opacity-40">Mark reviewed</button>
                <button type="button" disabled={busy || current.processing_state === 'unread'} onClick={() => void update('unread')} className="rounded-lg border border-slate-600 px-3 py-2 text-xs disabled:opacity-40">Mark unread</button>
                <button type="button" disabled={busy || current.processing_state === 'archived'} onClick={() => void update('archived')} className="rounded-lg border border-slate-600 px-3 py-2 text-xs disabled:opacity-40">Archive</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{current.body_text || 'This message has no stored plain-text body.'}</p>
              {current.attachments?.length > 0 && <div className="mt-6 rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-100">
                {current.attachments.length} attachment(s) reported. Download is unavailable until private attachment storage is configured.
              </div>}
              <p className="text-xs text-slate-500 mt-6">Replies are disabled until sending authentication and a separate manual-send approval flow are verified.</p>
            </div>
          </> : <div className="m-auto p-8 text-sm text-slate-500">Select an email to review.</div>}
        </main>
      </div>
    </section>
  );
}

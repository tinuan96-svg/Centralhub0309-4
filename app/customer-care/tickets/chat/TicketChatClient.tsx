'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import type { WhatsAppConversation, WhatsAppMessage } from '@/lib/types';
import WhatsAppMessageContent from '@/components/customer-care/WhatsAppMessageContent';

const formatTime = (value?: string | null) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : '';

export default function TicketChatClient({ conversationId, ticketId }: { conversationId: string; ticketId?: string | null }) {
  const [conversation, setConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!conversationId) return;
    try {
      setError(null);
      const { data, error: conversationError } = await supabase
        .from('whatsapp_conversations')
        .select('*, contact:whatsapp_contacts(*)')
        .eq('id', conversationId)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!data) throw new Error('The conversation linked to this ticket could not be found.');
      setConversation(data as WhatsAppConversation);
      setMessages(await whatsappService.getMessages(conversationId));
    } catch (cause: any) {
      setError(cause?.message || 'Unable to open this customer chat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (!conversationId) return;
    const channel = supabase
      .channel(`ticket_chat_${conversationId}_${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        whatsappService.getMessages(conversationId).then(setMessages).catch(() => undefined);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    const to = conversation?.contact?.phone_number;
    if (!body || !conversation || !to || sending) return;
    setSending(true);
    try {
      const result = await whatsappService.sendMessage({
        to,
        text: body,
        conversationId: conversation.id,
      });
      if (!result.success) {
        alert(result.windowExpired
          ? `${result.error}\n\nThe WhatsApp 24-hour customer-service window is closed.`
          : result.error || 'Message could not be sent.');
        return;
      }
      setText('');
      setMessages(await whatsappService.getMessages(conversation.id));
    } finally {
      setSending(false);
    }
  };

  if (!conversationId) {
    return <div className="p-6 text-slate-300">This ticket is not linked to a customer conversation.</div>;
  }

  return (
    <div className="min-h-[calc(100dvh-8rem)] bg-slate-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-3 sm:px-5 py-3">
        <div className="flex items-center gap-3">
          <Link href="/customer-care/tickets" className="h-10 w-10 shrink-0 rounded-xl border border-slate-700 bg-slate-900 flex items-center justify-center text-lg" aria-label="Back to support tickets">←</Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[.18em] font-black text-cyan-400">Support ticket chat</p>
            <h1 className="font-black truncate">{conversation?.contact?.display_name || conversation?.contact?.phone_number || 'Customer'}</h1>
            <p className="text-[10px] text-slate-500 truncate">{ticketId ? `Ticket #${ticketId.slice(0, 8).toUpperCase()} · ` : ''}{conversation?.contact?.phone_number || ''}</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 grid place-items-center text-slate-500">Opening customer chat…</div>
      ) : error ? (
        <div className="m-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3 pb-28">
            {messages.map((message) => {
              const outbound = message.direction === 'outbound';
              return (
                <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] sm:max-w-[72%] rounded-2xl px-3 py-2.5 border ${outbound ? 'bg-blue-950/90 border-blue-700/50' : 'bg-slate-900 border-slate-800'}`}>
                    <WhatsAppMessageContent message={message} />
                    <div className={`mt-1 text-[9px] ${outbound ? 'text-blue-300/60 text-right' : 'text-slate-500'}`}>
                      {formatTime(message.created_at)}{outbound && message.status ? ` · ${message.status}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="fixed left-0 right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-20 border-t border-slate-800 bg-slate-950/98 backdrop-blur p-3">
            <div className="mx-auto max-w-4xl flex items-end gap-2">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Reply to customer…"
                className="min-h-12 max-h-32 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !text.trim()}
                className="h-12 px-5 rounded-2xl bg-cyan-500 text-slate-950 font-black disabled:opacity-40"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

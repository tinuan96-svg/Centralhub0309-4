'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StoreService } from '@/lib/services/storeService';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import type { WhatsAppConversation, WhatsAppMessage } from '@/lib/types';

type ConversationWithStore = WhatsAppConversation & { storeName: string; unread: number };

const timeLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

export default function DashboardStoreChat() {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationWithStore[]>([]);
  const [selected, setSelected] = useState<ConversationWithStore | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);

  const loadInbox = useCallback(async () => {
    try {
      const [storeRows, convRows] = await Promise.all([
        StoreService.getAllStores(),
        whatsappService.getConversations(),
      ]);

      const ids = convRows.map(c => c.id);
      let unreadByConversation: Record<string, number> = {};
      if (ids.length) {
        const { data } = await supabase
          .from('whatsapp_messages')
          .select('conversation_id')
          .in('conversation_id', ids)
          .eq('direction', 'inbound')
          .eq('status', 'received');
        for (const row of data || []) unreadByConversation[row.conversation_id] = (unreadByConversation[row.conversation_id] || 0) + 1;
      }

      const storeMap = new Map(storeRows.map(s => [s.id, s.name]));
      const mapped = convRows
        .map(c => ({
          ...c,
          storeName: c.store_id ? (storeMap.get(c.store_id) || 'Store') : 'Unassigned store',
          unread: unreadByConversation[c.id] || 0,
        }))
        .sort((a, b) => new Date(b.last_message_at || b.updated_at).getTime() - new Date(a.last_message_at || a.updated_at).getTime());

      setConversations(mapped);
      setSelected(prev => prev ? (mapped.find(c => c.id === prev.id) || null) : null);
    } catch (e: any) {
      setError(e?.message || 'Could not load customer chats');
    }
  }, []);

  const loadMessages = useCallback(async (conversation: ConversationWithStore) => {
    setLoading(true);
    setError(null);
    shouldScrollToBottomRef.current = true;
    setShowLatest(false);
    try {
      const rows = await whatsappService.getMessages(conversation.id);
      setMessages(rows);
      await supabase
        .from('whatsapp_messages')
        .update({ status: 'read' })
        .eq('conversation_id', conversation.id)
        .eq('direction', 'inbound')
        .eq('status', 'received');
      await loadInbox();
    } catch (e: any) {
      setError(e?.message || 'Could not load this conversation');
    } finally {
      setLoading(false);
    }
  }, [loadInbox]);

  useEffect(() => {
    loadInbox();
    const channel = supabase
      .channel('dashboard_store_chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, loadInbox)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, async (payload: any) => {
        await loadInbox();
        if (selected?.id && payload?.new?.conversation_id === selected.id) {
          const viewport = messagesViewportRef.current;
          const wasNearBottom = !viewport || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
          const rows = await whatsappService.getMessages(selected.id);
          shouldScrollToBottomRef.current = wasNearBottom;
          setMessages(rows);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadInbox, selected?.id]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !shouldScrollToBottomRef.current) return;
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
      setShowLatest(false);
      shouldScrollToBottomRef.current = false;
    });
  }, [messages, loading]);

  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setShowLatest(distanceFromBottom > 180);
  };

  const scrollToLatest = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    setShowLatest(false);
  };

  const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + c.unread, 0), [conversations]);
  const grouped = useMemo(() => {
    const map = new Map<string, ConversationWithStore[]>();
    for (const conversation of conversations) {
      if (!map.has(conversation.storeName)) map.set(conversation.storeName, []);
      map.get(conversation.storeName)!.push(conversation);
    }
    return Array.from(map.entries());
  }, [conversations]);

  const selectConversation = async (conversation: ConversationWithStore) => {
    setSelected(conversation);
    setMessages([]);
    await loadMessages(conversation);
  };

  const closeChat = () => {
    setSelected(null);
    setMessages([]);
    setText('');
    setError(null);
    setShowLatest(false);
  };

  const closeInbox = () => {
    setOpen(false);
    closeChat();
  };

  const send = async () => {
    if (!selected || !text.trim() || sending) return;
    const message = text.trim();
    const phone = selected.contact?.phone_number;
    if (!phone) {
      setError('This customer does not have a WhatsApp phone number.');
      return;
    }
    setSending(true);
    setError(null);
    shouldScrollToBottomRef.current = true;
    try {
      const result = await whatsappService.sendMessage({
        to: phone,
        text: message,
        conversationId: selected.id,
        storeId: selected.store_id || undefined,
      });
      if (!result.success) throw new Error(result.error || 'Message could not be sent');
      setText('');
      const rows = await whatsappService.getMessages(selected.id);
      setMessages(rows);
      await loadInbox();
    } catch (e: any) {
      setError(e?.message || 'Message could not be sent');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open customer WhatsApp chats"
        className="fixed z-[80] right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6 h-14 w-14 rounded-full bg-emerald-500 text-white shadow-2xl shadow-emerald-900/40 flex items-center justify-center border-2 border-white/20 active:scale-95 transition-transform"
      >
        <span className="text-2xl leading-none">💬</span>
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-6 h-6 px-1 rounded-full bg-rose-500 border-2 border-slate-950 text-[11px] font-black flex items-center justify-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-none">
          <div className="box-border w-full h-full sm:h-[min(780px,92vh)] sm:max-w-5xl bg-slate-950 border border-slate-800 sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <header className="shrink-0 h-16 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[.2em] font-black text-emerald-400">Customer WhatsApp</p>
                <h2 className="text-base sm:text-lg font-black text-white truncate">Store chats</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={loadInbox} className="px-3 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-300 active:scale-95">Refresh</button>
                <button type="button" onClick={closeInbox} aria-label="Close chats" className="h-10 w-10 rounded-full bg-slate-800 text-slate-200 text-xl">×</button>
              </div>
            </header>

            <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
              <aside className={`${selected ? 'hidden sm:flex' : 'flex'} w-full sm:w-80 shrink-0 border-r border-slate-800 overflow-y-auto overscroll-contain flex-col bg-slate-950`}>
                {grouped.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">No customer chats yet.</div>
                ) : grouped.map(([storeName, rows]) => (
                  <section key={storeName}>
                    <div className="sticky top-0 z-10 px-4 py-3 bg-slate-900 border-y border-slate-800 text-[10px] uppercase tracking-[.18em] font-black text-cyan-400 flex justify-between">
                      <span>{storeName}</span>
                      <span>{rows.reduce((n, c) => n + c.unread, 0) || ''}</span>
                    </div>
                    {rows.map(conversation => {
                      const active = selected?.id === conversation.id;
                      return (
                        <button type="button" key={conversation.id} onClick={() => selectConversation(conversation)} className={`w-full text-left px-4 py-3 border-b border-slate-900 flex gap-3 ${active ? 'bg-cyan-950/40' : 'hover:bg-slate-900/70'}`}>
                          <div className="h-11 w-11 rounded-full bg-slate-800 shrink-0 flex items-center justify-center text-sm font-black text-cyan-300">
                            {(conversation.contact?.display_name || 'C').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-sm text-white truncate">{conversation.contact?.display_name || conversation.contact?.phone_number || 'Customer'}</p>
                              {conversation.unread > 0 && <span className="min-w-5 h-5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">{conversation.unread > 9 ? '9+' : conversation.unread}</span>}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-1">{conversation.contact?.phone_number || 'WhatsApp customer'}</p>
                          </div>
                          <span className="text-[9px] text-slate-600 shrink-0 mt-1">{timeLabel(conversation.last_message_at)}</span>
                        </button>
                      );
                    })}
                  </section>
                ))}
              </aside>

              <main className={`${selected ? 'flex' : 'hidden sm:flex'} min-w-0 min-h-0 flex-1 flex-col bg-[#07101c] overflow-hidden`}>
                {!selected ? (
                  <div className="flex-1 flex items-center justify-center text-center p-8 text-slate-500">Select a customer to start chatting.</div>
                ) : (
                  <>
                    <div className="h-16 shrink-0 px-3 sm:px-5 border-b border-slate-800 bg-slate-900 flex items-center gap-3">
                      <button type="button" onClick={closeChat} aria-label="Back to customer chats" className="sm:hidden h-9 w-9 shrink-0 rounded-full bg-slate-800 text-white text-xl">‹</button>
                      <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-900/50 flex items-center justify-center font-black text-emerald-300">{(selected.contact?.display_name || 'C').slice(0,1).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-white truncate">{selected.contact?.display_name || 'Customer'}</p>
                        <p className="text-[10px] text-slate-500 truncate">{selected.storeName} · {selected.contact?.phone_number}</p>
                      </div>
                      <span className="text-[9px] uppercase tracking-widest text-emerald-400 font-black">WhatsApp</span>
                    </div>

                    <div
                      ref={messagesViewportRef}
                      onScroll={handleMessagesScroll}
                      className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-5 space-y-2"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      {loading ? (
                        <div className="h-full flex items-center justify-center text-sm text-slate-500">Loading chat…</div>
                      ) : messages.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-slate-500">No messages in this conversation.</div>
                      ) : (
                        messages.map(msg => (
                          <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[86%] sm:max-w-[72%] rounded-2xl px-3 py-2 ${msg.direction === 'outbound' ? 'bg-emerald-700 text-white rounded-br-md' : 'bg-slate-800 text-slate-100 rounded-bl-md'}`}>
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.message_text || `[${msg.message_type}]`}</p>
                              <div className="mt-1 flex items-center justify-end gap-1 text-[9px] opacity-60">
                                <span>{timeLabel(msg.created_at)}</span>
                                {msg.direction === 'outbound' && <span>{msg.status === 'failed' ? '!' : msg.status === 'read' ? '✓✓' : '✓'}</span>}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {showLatest && selected && (
                      <button type="button" onClick={scrollToLatest} aria-label="Jump to latest messages" className="absolute bottom-20 right-4 z-20 h-10 w-10 rounded-full bg-slate-800 border border-slate-700 text-white shadow-xl active:scale-95">↓</button>
                    )}

                    {error && <div className="shrink-0 mx-3 mb-2 rounded-lg bg-rose-950/50 border border-rose-800/50 px-3 py-2 text-xs text-rose-300">{error}</div>}
                    <div className="shrink-0 border-t border-slate-800 bg-slate-900 p-2 sm:p-3 pb-[calc(.5rem+env(safe-area-inset-bottom))] flex items-end gap-2">
                      <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                        rows={1}
                        placeholder="Type a message…"
                        className="min-h-11 max-h-28 flex-1 resize-none rounded-2xl bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button type="button" onClick={send} disabled={sending || !text.trim()} aria-label="Send message" className="h-11 min-w-11 px-4 rounded-full bg-emerald-500 text-slate-950 font-black disabled:opacity-40 active:scale-95">
                        {sending ? '…' : '➤'}
                      </button>
                    </div>
                  </>
                )}
              </main>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

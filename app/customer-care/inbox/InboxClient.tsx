'use client';

import { useState, useEffect, useRef } from 'react';
import { WhatsAppConversation, WhatsAppMessage } from '@/lib/types';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import { Card, Button, Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import CreateTicketModal from '@/components/CreateTicketModal';
import SalesOpportunitiesPanel from './SalesOpportunitiesPanel';

const formatDate = (date: string | null) => {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatFullDate = (date: string | null) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function InboxClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const [customerContext, setCustomerContext] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [showMobileProfile, setShowMobileProfile] = useState(false);
  const [showConversationList, setShowConversationList] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();

    const channelName = `inbox_conversations_${Math.random().toString(36).slice(2, 9)}`;
    const convSubscription = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => {
        loadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(convSubscription);
    };
  }, []);

  useEffect(() => {
    if (!selectedConv) return;

    loadMessages(selectedConv.id);
    loadCustomerContext(selectedConv.contact?.phone_number);
    setShowConversationList(false);

    const msgChannelName = `inbox_msg_${selectedConv.id}_${Math.random().toString(36).slice(2, 9)}`;
    const msgSubscription = supabase
      .channel(msgChannelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${selectedConv.id}`
      }, (payload) => {
        const newMsg = payload.new as WhatsAppMessage;
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id || (m.wa_message_id && m.wa_message_id === newMsg.wa_message_id))) return prev;
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${selectedConv.id}`
      }, (payload) => {
        const updatedMsg = payload.new as WhatsAppMessage;
        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgSubscription);
    };
  }, [selectedConv]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages]);

  const loadConversations = async () => {
    try {
      setError(null);
      const data = await whatsappService.getConversations();
      setConversations(data);
      if (data.length > 0 && !selectedConv) setSelectedConv(data[0]);
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
      setError(err.message || 'Failed to connect to the database. The schema cache may be stale.');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (id: string) => {
    try {
      const data = await whatsappService.getMessages(id);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const loadCustomerContext = async (phone?: string) => {
    if (!phone) return;
    setLoadingContext(true);
    try {
      const data = await whatsappService.getCustomerContext(phone);
      setCustomerContext(data);
    } catch (err) {
      console.error('Failed to load customer context:', err);
    } finally {
      setLoadingContext(false);
    }
  };

  const handleSend = async () => {
    if (!msgInput.trim() || !selectedConv || sending) return;

    const to = selectedConv.contact?.phone_number;
    if (!to) {
      alert('Recipient phone number missing. Cannot send message.');
      return;
    }

    setSending(true);
    try {
      const res = await whatsappService.sendMessage({
        to,
        text: msgInput.trim(),
        conversationId: selectedConv.id
      });
      if (!res.success) {
        alert(`Failed to send: ${res.error}`);
        return;
      }
      setMsgInput('');
      await loadMessages(selectedConv.id);
    } catch (err: any) {
      console.error('[Inbox] Failed to send message:', err);
      alert(err.message || 'Connection error. Please check your internet and Meta API configuration.');
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = async () => {
    if (!selectedConv) return;
    try {
      const updated = await whatsappService.updateHandlingMode(selectedConv.id, 'HUMAN');
      setSelectedConv(updated);
    } catch (err) {
      console.error('Takeover failed:', err);
    }
  };

  const handleReturnToAI = async () => {
    if (!selectedConv) return;
    try {
      const updated = await whatsappService.updateHandlingMode(selectedConv.id, 'AI');
      setSelectedConv(updated);
    } catch (err) {
      console.error('Return to AI failed:', err);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 font-medium">Loading Inbox...</div>;

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Card className="max-w-md p-6 border-red-500/20 bg-red-500/5 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Connection Error</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Button onClick={loadConversations} className="w-full">Retry Connection</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-64px)] min-h-0 overflow-hidden relative bg-slate-950">
      {/* Conversation list */}
      <aside className={`${selectedConv ? 'hidden md:flex' : 'flex'} w-full md:w-80 min-h-0 border-r border-slate-800 flex-col bg-slate-900/50`}>
        <div className="h-14 shrink-0 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <h2 className="text-lg font-bold text-white uppercase tracking-tight">Inbox</h2>
          <span className="text-xs text-slate-500">{conversations.length}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConv(conv)}
              className={`w-full text-left px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors ${selectedConv?.id === conv.id ? 'bg-blue-500/10 border-r-2 border-r-blue-500' : ''}`}
            >
              <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-200 truncate text-sm">{conv.contact?.display_name || conv.contact?.phone_number}</span>
                <span className="text-[10px] text-slate-500 font-mono shrink-0">{formatDate(conv.last_message_at)}</span>
              </div>
              <p className="text-xs text-slate-400 truncate mb-2">{conv.status === 'open' ? 'Open conversation' : 'Recent conversation'}</p>
              <div className="flex gap-2">
                <Badge variant={conv.handling_mode === 'AI' ? 'info' : 'warning'} className="text-[9px] px-1.5 py-0 font-black">{conv.handling_mode}</Badge>
                <Badge variant="info" className="text-[9px] px-1.5 py-0 capitalize font-black">{conv.status}</Badge>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <main className={`${!selectedConv ? 'hidden md:flex' : 'flex'} min-w-0 min-h-0 flex-1 flex-col bg-slate-950`}>
        {selectedConv ? (
          <div className="flex min-h-0 h-full flex-col">
            {/* Fixed WhatsApp-style header */}
            <header className="h-16 shrink-0 px-3 sm:px-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-3 shadow-sm z-20">
              <div className="flex items-center min-w-0 gap-2 sm:gap-3">
                <button
                  type="button"
                  aria-label="Back to conversations"
                  onClick={() => { setSelectedConv(null); setShowMobileProfile(false); }}
                  className="md:hidden shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-300 hover:bg-slate-800 hover:text-white active:bg-slate-700"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-lg border border-slate-600 shadow-inner">👤</div>
                <div className="min-w-0 leading-tight">
                  <h3 className="font-semibold text-white truncate text-sm sm:text-base">{selectedConv.contact?.display_name || 'Customer'}</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 truncate">{selectedConv.contact?.phone_number || 'No phone number'}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <div className="hidden sm:block">
                  {selectedConv.handling_mode === 'AI' ? (
                    <Button onClick={handleTakeover} className="bg-amber-600 hover:bg-amber-700 text-[10px] font-black h-9 px-3">TAKEOVER</Button>
                  ) : (
                    <Button onClick={handleReturnToAI} variant="secondary" className="text-[10px] font-black h-9 px-3">AUTO</Button>
                  )}
                </div>
                <button type="button" onClick={() => setShowMobileProfile(true)} className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-300 hover:bg-slate-800" aria-label="Customer details">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
                <button type="button" onClick={() => setShowConversationList(true)} className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-300 hover:bg-slate-800" aria-label="Conversation list">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              </div>
            </header>

            {/* Message history */}
            <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 py-4 sm:py-6 space-y-3 bg-slate-950" style={{ WebkitOverflowScrolling: 'touch' }}>
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">No messages yet</div>
              ) : messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[88%] sm:max-w-[72%] rounded-2xl px-3.5 py-2.5 shadow-sm ${msg.direction === 'inbound' ? 'bg-slate-800 text-slate-100 rounded-tl-md' : msg.ai_generated ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 rounded-tr-md' : 'bg-emerald-600 text-white rounded-tr-md'}`}>
                    <WhatsAppMessageContent message={msg} />
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <span className="text-[10px] opacity-70">{formatDate(msg.created_at)}</span>
                      {msg.direction === 'outbound' && <span className="text-[9px] uppercase font-bold tracking-tight opacity-75">{msg.status}</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <footer className="shrink-0 border-t border-slate-800 bg-slate-900 px-3 sm:px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-2">
                <button type="button" className="shrink-0 w-10 h-10 rounded-full text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Attachments" title="Attachments">＋</button>
                <textarea
                  rows={1}
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 max-h-32 min-h-10 resize-none bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!msgInput.trim() || sending}
                  className="shrink-0 w-10 h-10 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-500"
                  aria-label="Send message"
                >
                  {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" /></svg>
                  )}
                </button>
              </div>
              <p className="hidden sm:block text-[10px] text-slate-500 mt-2">Enter to send • Shift+Enter for a new line</p>
            </footer>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">Select a conversation to start chatting</div>
        )}
      </main>

      {/* Desktop profile / mobile sheet */}
      <aside className={`${showMobileProfile ? 'fixed inset-0 z-50 flex' : 'hidden'} lg:flex lg:static w-full lg:w-80 border-l border-slate-800 bg-slate-900 flex-col p-4 overflow-y-auto`}>
        {selectedConv && (
          <div className="space-y-6 text-slate-200">
            <div className="flex justify-between items-center lg:hidden border-b border-slate-800 pb-4 mb-2">
              <h3 className="text-lg font-black uppercase tracking-tight">Customer details</h3>
              <button type="button" onClick={() => setShowMobileProfile(false)} className="p-2 bg-slate-800 rounded-full">✕</button>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">👤</div>
              <h3 className="mt-3 font-bold text-white">{selectedConv.contact?.display_name || 'Customer'}</h3>
              <p className="text-xs text-slate-400 mt-1">{selectedConv.contact?.phone_number}</p>
            </div>
            <SalesOpportunitiesPanel
              conversationId={selectedConv.id}
              onInsertProduct={(p) => setMsgInput(prev => `${prev}${prev ? '\n' : ''}${p?.name || ''}`)}
            />
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Customer context</div>
              {loadingContext ? <div className="text-slate-500">Loading…</div> : <pre className="whitespace-pre-wrap break-words text-xs text-slate-400">{customerContext ? JSON.stringify(customerContext, null, 2) : 'No additional customer context.'}</pre>}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile conversation-list overlay */}
      {showConversationList && (
        <div className="md:hidden fixed inset-0 z-[60] bg-slate-950 flex flex-col">
          <div className="h-16 shrink-0 px-4 border-b border-slate-800 flex items-center gap-3 bg-slate-900">
            <button type="button" onClick={() => setShowConversationList(false)} className="w-10 h-10 rounded-full hover:bg-slate-800 text-slate-300" aria-label="Close conversation list">✕</button>
            <div className="font-semibold text-white">Conversations</div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {conversations.map((conv) => (
              <button key={conv.id} onClick={() => { setSelectedConv(conv); setShowConversationList(false); }} className="w-full text-left p-4 border-b border-slate-800 hover:bg-slate-900">
                <div className="font-semibold text-white truncate">{conv.contact?.display_name || conv.contact?.phone_number}</div>
                <div className="text-xs text-slate-500 mt-1">{conv.contact?.phone_number}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isTicketModalOpen && selectedConv && (
        <CreateTicketModal
          isOpen={isTicketModalOpen}
          onClose={() => setIsTicketModalOpen(false)}
          conversationId={selectedConv.id}
          contactId={selectedConv.contact?.id}
        />
      )}
    </div>
  );
}

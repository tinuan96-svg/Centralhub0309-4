'use client';

import { useEffect, useRef, useState } from 'react';
import { WhatsAppConversation, WhatsAppMessage } from '@/lib/types';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import { Card, Button, Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import CreateTicketModal from '@/components/CreateTicketModal';
import SalesOpportunitiesPanel from './SalesOpportunitiesPanel';
import WhatsAppMessageContent from '@/components/customer-care/WhatsAppMessageContent';

const formatDate = (date: string | null) => {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatFullDate = (date: string | null) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const canApplyMessageStatus = (current: WhatsAppMessage['status'], incoming: WhatsAppMessage['status']) => {
  if (!incoming || current === incoming) return true;
  if (current === 'read') return false;
  if (current === 'delivered') return incoming === 'read';
  if (current === 'failed') return incoming === 'delivered' || incoming === 'read';
  if (current === 'sent') return incoming === 'delivered' || incoming === 'read' || incoming === 'failed';
  return true;
};

const messageStatusLabel = (status: WhatsAppMessage['status']) => {
  if (status === 'read') return 'Read';
  if (status === 'delivered') return 'Delivered';
  if (status === 'failed') return 'Failed';
  if (status === 'sent') return 'Sent';
  return 'Received';
};

const money = (value: unknown) => `£${Number(value || 0).toFixed(2)}`;

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
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<WhatsAppMessage | null>(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [messageActionBusy, setMessageActionBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    try {
      setError(null);
      const data = await whatsappService.getConversations();
      setConversations(data);
      setSelectedConv(prev => {
        if (!data.length) return null;
        if (!prev) return data[0];
        return data.find(conv => conv.id === prev.id) || data[0];
      });
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
    if (!phone) {
      setCustomerContext(null);
      return;
    }
    setLoadingContext(true);
    try {
      const data = await whatsappService.getCustomerContext(phone);
      setCustomerContext(data);
    } catch (err) {
      console.error('Failed to load customer context:', err);
      setCustomerContext(null);
    } finally {
      setLoadingContext(false);
    }
  };

  useEffect(() => {
    loadConversations();
    const channelName = `inbox_conversations_${Math.random().toString(36).slice(2, 9)}`;
    const convSubscription = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, loadConversations)
      .subscribe();
    return () => { supabase.removeChannel(convSubscription); };
  }, []);

  useEffect(() => {
    if (!selectedConv) {
      setMessages([]);
      setCustomerContext(null);
      return;
    }

    loadMessages(selectedConv.id);
    loadCustomerContext(selectedConv.contact?.phone_number);
    setShowConversationList(false);

    const msgChannelName = `inbox_msg_${selectedConv.id}_${Math.random().toString(36).slice(2, 9)}`;
    const msgSubscription = supabase
      .channel(msgChannelName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${selectedConv.id}`
      }, (payload) => {
        const newMsg = payload.new as WhatsAppMessage;
        if (newMsg.locally_deleted_at) return;
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id || (m.wa_message_id && m.wa_message_id === newMsg.wa_message_id))) return prev;
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${selectedConv.id}`
      }, (payload) => {
        const updatedMsg = payload.new as WhatsAppMessage;
        if (updatedMsg.locally_deleted_at) {
          setMessages(prev => prev.filter(m => m.id !== updatedMsg.id));
          return;
        }
        setMessages(prev => prev.map(m => {
          if (m.id !== updatedMsg.id) return m;
          if (!updatedMsg.status || canApplyMessageStatus(m.status, updatedMsg.status)) return { ...m, ...updatedMsg };
          return { ...m, ...updatedMsg, status: m.status };
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(msgSubscription); };
  }, [selectedConv?.id]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
  }, [messages.length]);

  const handleSend = async () => {
    if (!msgInput.trim() || !selectedConv || sending) return;
    const to = selectedConv.contact?.phone_number;
    if (!to) {
      alert('Recipient phone number missing. Cannot send message.');
      return;
    }

    setSending(true);
    try {
      const res = await whatsappService.sendMessage({ to, text: msgInput.trim(), conversationId: selectedConv.id });
      if (!res.success) {
        alert(res.windowExpired
          ? `Not sent: ${res.error}\n\nSend an approved WhatsApp template, or ask the customer to message you first.`
          : `Failed to send: ${res.error}`);
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

  const startLocalEdit = (message: WhatsAppMessage) => {
    setMessageMenuId(null);
    setEditingMessage(message);
    setEditMessageText(message.message_text || '');
  };

  const saveLocalEdit = async () => {
    if (!editingMessage || !editMessageText.trim() || messageActionBusy) return;
    setMessageActionBusy(true);
    try {
      const updated = await whatsappService.editMessageLocally(editingMessage, editMessageText);
      setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      setEditingMessage(null);
      setEditMessageText('');
    } catch (err: any) {
      alert(err?.message || 'Could not edit this message.');
    } finally {
      setMessageActionBusy(false);
    }
  };

  const hideMessage = async (message: WhatsAppMessage) => {
    setMessageMenuId(null);
    const remoteNotice = message.wa_message_id
      ? '\n\nThis only removes it from the CentralHub inbox. WhatsApp does not provide a recall/edit API for an already sent message, so the customer copy will remain unchanged.'
      : '';
    if (!window.confirm(`Remove this message from the CentralHub chat view?${remoteNotice}`)) return;
    setMessageActionBusy(true);
    try {
      await whatsappService.hideMessageLocally(message.id);
      setMessages(prev => prev.filter(m => m.id !== message.id));
    } catch (err: any) {
      alert(err?.message || 'Could not remove this message from the inbox.');
    } finally {
      setMessageActionBusy(false);
    }
  };

  const handleTakeover = async () => {
    if (!selectedConv) return;
    try {
      const updated = await whatsappService.updateHandlingMode(selectedConv.id, 'HUMAN');
      setSelectedConv(prev => prev ? { ...prev, ...updated } : updated);
    } catch (err) {
      console.error('Takeover failed:', err);
    }
  };

  const handleReturnToAI = async () => {
    if (!selectedConv) return;
    try {
      const updated = await whatsappService.updateHandlingMode(selectedConv.id, 'AI');
      setSelectedConv(prev => prev ? { ...prev, ...updated } : updated);
    } catch (err) {
      console.error('Return to AI failed:', err);
    }
  };

  const contextCustomer = customerContext?.customer || null;
  const contextStats = customerContext?.stats || null;
  const latestOrder = customerContext?.latest_order || null;
  const recentOrders = Array.isArray(customerContext?.all_orders) ? customerContext.all_orders : [];

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
    <div className="flex h-[calc(100dvh-64px)] max-h-[calc(100dvh-64px)] w-full max-w-full min-h-0 overflow-hidden relative bg-slate-950">
      {/* Desktop / tablet conversation list. The list owns its vertical scroll. */}
      <aside className={`${selectedConv ? 'hidden md:flex' : 'flex'} w-full md:w-64 lg:w-72 2xl:w-80 h-full max-h-full flex-none min-h-0 overflow-hidden border-r border-slate-800 flex-col bg-slate-900/50`}>
        <div className="h-12 lg:h-14 shrink-0 px-3 lg:px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <h2 className="text-base lg:text-lg font-bold text-white uppercase tracking-tight">Inbox</h2>
          <span className="text-[10px] lg:text-xs text-slate-500">{conversations.length}</span>
        </div>
        <div className="flex-1 h-0 min-h-0 overflow-y-scroll overscroll-contain touch-pan-y [scrollbar-gutter:stable]" style={{ WebkitOverflowScrolling: 'touch' }}>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConv(conv)}
              className={`w-full text-left px-3 lg:px-4 py-2.5 lg:py-3 border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors ${selectedConv?.id === conv.id ? 'bg-blue-500/10 border-r-2 border-r-blue-500' : ''}`}
            >
              <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold text-slate-200 truncate text-xs lg:text-sm">{conv.contact?.display_name || conv.contact?.phone_number}</span>
                <span className="text-[9px] text-slate-500 font-mono shrink-0">{formatDate(conv.last_message_at)}</span>
              </div>
              <p className="text-[10px] lg:text-xs text-slate-400 truncate mb-1.5">{conv.status === 'open' ? 'Open conversation' : 'Recent conversation'}</p>
              <div className="flex gap-1.5">
                <Badge variant={conv.handling_mode === 'AI' ? 'info' : 'warning'} className="text-[8px] px-1.5 py-0 font-black">{conv.handling_mode}</Badge>
                <Badge variant="info" className="text-[8px] px-1.5 py-0 capitalize font-black">{conv.status}</Badge>
              </div>
            </button>
          ))}
          <div className="h-6" aria-hidden="true" />
        </div>
      </aside>

      <main className={`${!selectedConv ? 'hidden md:flex' : 'flex'} min-w-0 min-h-0 h-full flex-1 basis-0 flex-col bg-slate-950 overflow-hidden`}>
        {selectedConv ? (
          <div className="flex min-h-0 h-full flex-col overflow-hidden">
            {/* Always-visible recent customers on Android/mobile. */}
            <div className="md:hidden shrink-0 border-b border-slate-800 bg-slate-900/95 px-2 py-1.5">
              <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setShowConversationList(true)}
                  className="shrink-0 h-9 px-2.5 rounded-lg border border-slate-700 bg-slate-800 text-[10px] font-bold text-cyan-300"
                >
                  Recent {conversations.length}
                </button>
                {conversations.slice(0, 10).map(conv => (
                  <button
                    type="button"
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    title={conv.contact?.display_name || conv.contact?.phone_number || 'Customer'}
                    className={`shrink-0 max-w-[92px] h-9 px-2 rounded-lg border flex items-center gap-1.5 ${selectedConv.id === conv.id ? 'border-cyan-500/60 bg-cyan-500/10 text-white' : 'border-slate-800 bg-slate-950/70 text-slate-300'}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-black uppercase">
                      {(conv.contact?.display_name || conv.contact?.phone_number || '?').slice(0, 1)}
                    </span>
                    <span className="truncate text-[9px] font-semibold">{conv.contact?.display_name || conv.contact?.phone_number}</span>
                  </button>
                ))}
              </div>
            </div>

            <header className="h-12 sm:h-14 lg:h-16 shrink-0 px-2 sm:px-3 lg:px-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-2 shadow-sm z-20">
              <div className="flex items-center min-w-0 gap-1.5 sm:gap-2 lg:gap-3">
                <button
                  type="button"
                  aria-label="Show all conversations"
                  onClick={() => setShowConversationList(true)}
                  className="md:hidden shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-300 hover:bg-slate-800 hover:text-white active:bg-slate-700"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <div className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 shrink-0 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-sm lg:text-lg border border-slate-600 shadow-inner">👤</div>
                <div className="min-w-0 leading-tight">
                  <h3 className="font-semibold text-white truncate text-xs sm:text-sm lg:text-base">{selectedConv.contact?.display_name || 'Customer'}</h3>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs text-slate-400 truncate">{selectedConv.contact?.phone_number || 'No phone number'}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {selectedConv.handling_mode === 'AI' ? (
                  <button onClick={handleTakeover} className="h-8 px-2 sm:px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-[9px] sm:text-[10px] font-black text-white">TAKEOVER</button>
                ) : (
                  <button onClick={handleReturnToAI} className="h-8 px-2 sm:px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-[9px] sm:text-[10px] font-black text-white">AUTO</button>
                )}
                <button type="button" onClick={() => setShowMobileProfile(true)} className="2xl:hidden inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full text-slate-300 hover:bg-slate-800" aria-label="Customer details">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
            </header>

            {/* Compact customer/order summary stays visible on Android. */}
            <div className="md:hidden shrink-0 border-b border-slate-800 bg-slate-950/95 px-2 py-1.5">
              {loadingContext ? (
                <div className="h-8 flex items-center text-[10px] text-slate-500">Loading customer details…</div>
              ) : (
                <div className="grid grid-cols-[0.8fr_1fr_1.25fr_auto] gap-1.5 items-stretch">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1">
                    <div className="text-[8px] uppercase text-slate-500">Orders</div>
                    <div className="text-[11px] font-bold text-white">{contextStats?.total_orders ?? 0}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1">
                    <div className="text-[8px] uppercase text-slate-500">Spent</div>
                    <div className="text-[11px] font-bold text-emerald-300">{money(contextStats?.total_spend)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 min-w-0">
                    <div className="text-[8px] uppercase text-slate-500">Latest order</div>
                    <div className="text-[10px] font-bold text-cyan-300 truncate">{latestOrder?.confirmed_order_number || latestOrder?.order_number || '—'}</div>
                  </div>
                  <button type="button" onClick={() => setShowMobileProfile(true)} className="rounded-lg border border-cyan-700/50 bg-cyan-500/10 px-2 text-[9px] font-bold text-cyan-300">Details</button>
                </div>
              )}
            </div>

            <div ref={chatScrollRef} className="flex-1 h-0 min-h-0 overflow-y-scroll overscroll-contain touch-pan-y px-2.5 sm:px-4 lg:px-5 py-2.5 sm:py-4 lg:py-6 space-y-2.5 sm:space-y-3 bg-slate-950" style={{ WebkitOverflowScrolling: 'touch' }}>
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs sm:text-sm text-slate-500">No messages yet</div>
              ) : messages.map((msg) => (
                <div key={msg.id} className={`group flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`relative max-w-[91%] sm:max-w-[76%] lg:max-w-[72%] rounded-xl sm:rounded-2xl px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-sm text-[12px] sm:text-sm ${msg.direction === 'inbound' ? 'bg-slate-800 text-slate-100 rounded-tl-md' : msg.ai_generated ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 rounded-tr-md' : 'bg-emerald-600 text-white rounded-tr-md'}`}>
                    <button
                      type="button"
                      aria-label="Message actions"
                      onClick={() => setMessageMenuId(prev => prev === msg.id ? null : msg.id)}
                      className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full border border-slate-700 bg-slate-950/95 text-slate-300 shadow-md flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                    >
                      ⋮
                    </button>
                    {messageMenuId === msg.id && (
                      <div className="absolute right-0 top-7 z-30 w-44 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl text-left">
                        {msg.message_text && (
                          <button type="button" onClick={() => startLocalEdit(msg)} className="w-full px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 text-left">Edit in CentralHub</button>
                        )}
                        <button type="button" onClick={() => hideMessage(msg)} className="w-full px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 text-left">Remove from inbox</button>
                        {msg.wa_message_id && <div className="px-3 py-2 border-t border-slate-800 text-[9px] leading-snug text-slate-500">WhatsApp-sent messages cannot be recalled or changed on the customer's phone.</div>}
                      </div>
                    )}
                    <WhatsAppMessageContent message={msg} />
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {msg.locally_edited_at && <span className="text-[8px] sm:text-[9px] opacity-60">Edited in CentralHub</span>}
                      <span className="text-[8px] sm:text-[10px] opacity-70">{formatDate(msg.created_at)}</span>
                      {msg.direction === 'outbound' && <span title={msg.delivery_error_message || `WhatsApp status: ${messageStatusLabel(msg.status)}`} className="text-[8px] sm:text-[9px] uppercase font-bold tracking-tight opacity-75">{messageStatusLabel(msg.status)}</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <footer className="shrink-0 border-t border-slate-800 bg-slate-900 px-2 sm:px-3 lg:px-4 pt-2 sm:pt-3 pb-[calc(0.45rem+env(safe-area-inset-bottom))] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-1.5 sm:gap-2">
                <button type="button" className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Attachments" title="Attachments">＋</button>
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
                  className="flex-1 max-h-28 min-h-8 sm:min-h-10 resize-none bg-slate-800 border border-slate-700 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2.5 text-[12px] sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!msgInput.trim() || sending}
                  className="shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-500"
                  aria-label="Send message"
                >
                  {sending ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" /></svg>
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

      {/* Structured customer details: permanently visible on very wide desktop, full-screen sheet on smaller screens. */}
      <aside className={`${showMobileProfile ? 'fixed inset-0 z-50 flex' : 'hidden'} 2xl:flex 2xl:static w-full 2xl:w-80 min-h-0 border-l border-slate-800 bg-slate-900 flex-col overflow-y-auto`}>
        {selectedConv && (
          <div className="p-3 sm:p-4 space-y-4 text-slate-200 w-full">
            <div className="flex justify-between items-center 2xl:hidden border-b border-slate-800 pb-3 sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight">Customer details</h3>
                <p className="text-[10px] text-slate-500">Orders, contact and support context</p>
              </div>
              <button type="button" onClick={() => setShowMobileProfile(false)} className="w-9 h-9 bg-slate-800 rounded-full">✕</button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-lg">👤</div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white truncate">{selectedConv.contact?.display_name || contextCustomer?.name || 'Customer'}</h3>
                  <p className="text-xs text-slate-400 truncate">{selectedConv.contact?.phone_number || contextCustomer?.phone || 'No phone'}</p>
                  {contextCustomer?.email && <p className="text-[10px] text-slate-500 truncate">{contextCustomer.email}</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="text-[9px] uppercase font-black text-slate-500">Total orders</div>
                <div className="text-xl font-black text-white mt-1">{contextStats?.total_orders ?? 0}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="text-[9px] uppercase font-black text-slate-500">Total spent</div>
                <div className="text-lg font-black text-emerald-300 mt-1">{money(contextStats?.total_spend)}</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-[9px] uppercase font-black text-slate-500 mb-2">Latest order</div>
              {loadingContext ? (
                <div className="text-xs text-slate-500">Loading…</div>
              ) : latestOrder ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-cyan-300 truncate">{latestOrder.confirmed_order_number || latestOrder.order_number}</span>
                    <span className="text-xs font-bold text-white">{money(latestOrder.total)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="capitalize text-amber-300">{String(latestOrder.order_status || latestOrder.status || 'unknown').replace(/_/g, ' ')}</span>
                    <span className="text-slate-500">{formatFullDate(latestOrder.created_at)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">No linked order found.</div>
              )}
            </div>

            {recentOrders.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="text-[9px] uppercase font-black text-slate-500 mb-2">Recent orders</div>
                <div className="space-y-1.5">
                  {recentOrders.map((order: any) => (
                    <div key={order.id || order.order_number} className="flex items-center justify-between gap-2 text-[10px] border-b border-slate-800/60 last:border-0 pb-1.5 last:pb-0">
                      <span className="truncate text-slate-300">{order.confirmed_order_number || order.order_number}</span>
                      <span className="shrink-0 text-slate-400">{money(order.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setIsTicketModalOpen(true)} className="rounded-lg border border-blue-700/50 bg-blue-500/10 py-2 text-[10px] font-black text-blue-300">CREATE TICKET</button>
              <button type="button" onClick={() => setShowConversationList(true)} className="2xl:hidden rounded-lg border border-slate-700 bg-slate-800 py-2 text-[10px] font-black text-slate-300">RECENT CONTACTS</button>
            </div>

            <SalesOpportunitiesPanel
              conversationId={selectedConv.id}
              onInsertProduct={(p) => {
                setMsgInput(prev => `${prev}${prev ? '\n' : ''}${p?.name || ''}`);
                setShowMobileProfile(false);
              }}
            />
          </div>
        )}
      </aside>

      {/* Complete recent-customer list for Android; use explicit scroll ownership so Chrome/WebView cannot trap it. */}
      {showConversationList && (
        <div className="md:hidden fixed inset-0 z-[60] h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-950 flex flex-col">
          <div className="h-12 shrink-0 px-3 border-b border-slate-800 flex items-center gap-3 bg-slate-900">
            <button type="button" onClick={() => setShowConversationList(false)} className="w-8 h-8 rounded-full hover:bg-slate-800 text-slate-300" aria-label="Close conversation list">✕</button>
            <div className="font-semibold text-sm text-white">Recent customers</div>
            <span className="ml-auto text-[10px] text-slate-500">{conversations.length}</span>
          </div>
          <div className="flex-1 h-0 min-h-0 overflow-y-scroll overscroll-contain touch-pan-y pb-[calc(1rem+env(safe-area-inset-bottom))]" style={{ WebkitOverflowScrolling: 'touch' }}>
            {conversations.map((conv) => (
              <button key={conv.id} onClick={() => { setSelectedConv(conv); setShowConversationList(false); }} className={`w-full text-left px-3 py-2.5 border-b border-slate-800 hover:bg-slate-900 ${selectedConv?.id === conv.id ? 'bg-cyan-500/10' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-white truncate">{conv.contact?.display_name || conv.contact?.phone_number}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">{conv.contact?.phone_number}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[9px] text-slate-500">{formatDate(conv.last_message_at)}</div>
                    <div className="flex gap-1 mt-1 justify-end">
                      <span className="text-[8px] rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300">{conv.handling_mode}</span>
                      <span className="text-[8px] rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 capitalize">{conv.status}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
            <div className="h-8" aria-hidden="true" />
          </div>
        </div>
      )}

      {editingMessage && (
        <div className="fixed inset-0 z-[80] bg-black/65 flex items-center justify-center p-3" onClick={() => !messageActionBusy && setEditingMessage(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white">Edit message in CentralHub</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-amber-300">This changes the CentralHub inbox record only. A message already sent through WhatsApp cannot be edited on the customer's phone.</p>
            <textarea autoFocus rows={5} value={editMessageText} onChange={(e) => setEditMessageText(e.target.value)} className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-cyan-500" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" disabled={messageActionBusy} onClick={() => setEditingMessage(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Cancel</button>
              <button type="button" disabled={messageActionBusy || !editMessageText.trim()} onClick={saveLocalEdit} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{messageActionBusy ? 'Saving…' : 'Save local edit'}</button>
            </div>
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
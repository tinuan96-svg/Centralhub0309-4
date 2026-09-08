'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Badge } from '@/lib/design-system';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function ConversationsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logConversation, setLogConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, [selectedStoreId]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const data = await whatsappService.getConversations(selectedStoreId || undefined);
      setConversations(data);
    } catch (err) {
      console.error('Load conversations error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openLog = async (conversation: any) => {
    setLogConversation(conversation);
    setMessages([]);
    setMessageError(null);
    setMessagesLoading(true);
    try {
      const rows = await whatsappService.getMessages(conversation.id);
      setMessages(rows || []);
    } catch (error: any) {
      console.error('Load conversation log error:', error);
      setMessageError(error?.message || 'Could not load conversation messages.');
    } finally {
      setMessagesLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Conversations" subtitle="History of all customer WhatsApp interactions." />

      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500 animate-pulse">Loading conversation history...</div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
          <p className="text-slate-500 text-sm">No conversations found.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {conversations.map((conv) => (
            <Card key={conv.id} className="p-4 bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-lg shrink-0">👤</div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-100 truncate">{conv.contact?.display_name || conv.contact?.phone_number}</h3>
                    <p className="text-xs text-slate-500">Last activity: {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString('en-GB') : 'No activity timestamp'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={conv.status === 'open' ? 'success' : 'info'} className="capitalize">{conv.status}</Badge>
                  <Badge variant="info" className="uppercase text-[10px]">{conv.handling_mode}</Badge>
                  <Button variant="secondary" className="text-xs" onClick={() => void openLog(conv)}>View Log</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {logConversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setLogConversation(null)} />
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 p-5">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white truncate">{logConversation.contact?.display_name || logConversation.contact?.phone_number || 'Conversation log'}</h2>
                <p className="text-xs text-slate-500">{logConversation.contact?.phone_number || 'No phone'} · {logConversation.status} · {logConversation.handling_mode}</p>
              </div>
              <button onClick={() => setLogConversation(null)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messagesLoading && <div className="py-12 text-center text-slate-500 animate-pulse">Loading message log…</div>}
              {messageError && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{messageError}</div>}
              {!messagesLoading && !messageError && messages.length === 0 && <div className="py-12 text-center text-slate-500">No messages found for this conversation.</div>}
              {messages.map(message => {
                const inbound = message.direction === 'inbound';
                return <div key={message.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[82%] rounded-2xl border px-4 py-3 ${inbound ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-blue-500/30 bg-blue-950/60 text-blue-50'}`}>
                    <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                      <span>{message.direction}</span><span>•</span><span>{message.message_type}</span><span>•</span><span>{message.status}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.message_text || (message.media_filename ? `Media: ${message.media_filename}` : 'No text body')}</p>
                    {message.delivery_error_message && <p className="mt-2 text-xs text-rose-300">{message.delivery_error_message}</p>}
                    <time className="mt-2 block text-right text-[10px] text-slate-500">{message.created_at ? new Date(message.created_at).toLocaleString('en-GB') : 'No timestamp'}</time>
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

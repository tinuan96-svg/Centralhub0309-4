'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Badge } from '@/lib/design-system';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function ConversationsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-lg">👤</div>
                  <div>
                    <h3 className="font-bold text-slate-100">{conv.contact?.display_name || conv.contact?.phone_number}</h3>
                    <p className="text-xs text-slate-500">Last activity: {new Date(conv.last_message_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={conv.status === 'open' ? 'success' : 'info'} className="capitalize">{conv.status}</Badge>
                  <Badge variant="info" className="uppercase text-[10px]">{conv.handling_mode}</Badge>
                  <Button variant="secondary" className="text-xs">View Log</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

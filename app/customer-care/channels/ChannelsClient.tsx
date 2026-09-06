'use client';

import { useState, useEffect } from 'react';
import { WhatsAppChannel, channelService } from '@/lib/services/customer-care/channelService';
import { designTokens, Card, Button, Badge, PageHeader } from '@/lib/design-system';
import WebhookConfigModal from './WebhookConfigModal';

export default function ChannelsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [webhookChannel, setWebhookChannel] = useState<WhatsAppChannel | null>(null);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      const data = await channelService.getChannels();
      setChannels(data);
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="WhatsApp Channels"
        subtitle="Manage Meta WhatsApp Business Account connections for your stores."
        action={<Button>+ Add Channel</Button>}
      />

      <div className="grid gap-6">
        {loading ? (
          <div className="text-center py-10 text-slate-500 animate-pulse">Loading channels...</div>
        ) : channels.length === 0 ? (
          <div className="text-center py-10 text-slate-500 bg-slate-900/20 rounded-lg border border-dashed border-slate-800">
            No WhatsApp channels configured.
            <p className="text-[10px] mt-2">Check &apos;whatsapp_channels&apos; table for configuration.</p>
          </div>
        ) : (
          channels.map((channel) => (
            <Card key={channel.id} className="p-6 bg-slate-900/40 border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-2xl">
                      💬
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{channel.business_name || channel.store?.name || 'WhatsApp Channel'}</h3>
                      <p className="text-sm text-slate-400">{channel.display_phone_number || 'No number assigned'}</p>
                    </div>
                    <Badge variant={channel.status === 'active' ? 'success' : 'info'} className="ml-2 uppercase text-[10px]">
                      {channel.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Store Link</label>
                      <span className="text-sm text-blue-400 font-medium">{channel.store?.name || 'Unlinked'}</span>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Phone Number ID</label>
                      <span className="text-xs text-slate-300 font-mono truncate block">{channel.phone_number_id || 'N/A'}</span>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">WABA ID</label>
                      <span className="text-xs text-slate-300 font-mono truncate block">{channel.waba_id || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row md:flex-col gap-2">
                  <Button variant="secondary" className="text-xs flex-1 md:flex-none" onClick={() => setWebhookChannel(channel)}>Configure Webhook</Button>
                  <Button variant="secondary" className="text-xs flex-1 md:flex-none">Manage Templates</Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {!loading && (
          <section className="pt-6">
            <h4 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest">Multi-Store Compliance</h4>
            <p className="text-[10px] text-slate-500 max-w-2xl leading-relaxed italic">
                CentralHub uses siloed WhatsApp Business Account (WABA) configurations.
                Each store must have its own Phone Number ID and Access Token registered in the database for correct outbound routing.
            </p>
          </section>
      )}

      {webhookChannel && (
        <WebhookConfigModal channel={webhookChannel} onClose={() => setWebhookChannel(null)} />
      )}
    </div>
  );
}

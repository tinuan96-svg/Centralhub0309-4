'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Badge, Button } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import TemplateViewModal from '@/components/TemplateViewModal';
import CreateAutomationModal from '@/components/CreateAutomationModal';

export default function TemplatesClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [targetTemplateId, setTargetTemplateId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (selectedStoreId) loadTemplates();
  }, [selectedStoreId]);

  const loadTemplates = async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_template_catalog')
        .select('*')
        .eq('store_id', selectedStoreId);
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewConfig = (template: any) => {
    setSelectedTemplate(template);
    setIsModalOpen(true);
  };

  const handleLinkToEvent = (template: any) => {
    setTargetTemplateId(template.id);
    setIsLinkModalOpen(true);
  };

  const handleSync = async () => {
    if (!selectedStoreId || syncing) return;
    setSyncing(true);
    try {
      const { data: channel, error: channelError } = await supabase
        .from('whatsapp_channels')
        .select('id,status')
        .eq('store_id', selectedStoreId)
        .maybeSingle();

      if (channelError) throw channelError;
      if (!channel?.id) throw new Error('No WhatsApp channel is configured for this store.');
      if (channel.status && String(channel.status).toLowerCase() !== 'active') {
        throw new Error('The WhatsApp channel is not active.');
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-template-sync', {
        body: { channelId: channel.id, storeId: selectedStoreId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Template sync failed.');

      await loadTemplates();
      alert(`Templates synced from Meta. ${data.synced ?? 0} fetched/updated, ${data.registry_created ?? 0} new registry records.`);
    } catch (err: any) {
      console.error('Template sync failed:', err);
      alert(err?.message || 'Template sync failed. Check the WhatsApp channel and Meta credentials.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="WhatsApp Templates"
        subtitle="Manage logical templates and their system event mappings."
        action={
          <Button onClick={handleSync} disabled={syncing || !selectedStoreId}>
            {syncing ? 'Syncing...' : 'Sync with Meta'}
          </Button>
        }
      />

      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      {!selectedStoreId ? (
        <div className="text-center py-10 text-slate-500 italic">Select a store to view its templates</div>
      ) : loading ? (
        <div className="text-center py-10 text-slate-500 italic animate-pulse">Fetching registry data...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
          <p className="text-slate-500 text-sm">No templates found for this store. Sync with Meta to import approved templates.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((tmpl) => (
            <Card key={tmpl.id} className="p-5 bg-slate-900/40 border-slate-800 flex items-center justify-between group hover:border-slate-700 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-100">{tmpl.name}</h3>
                  <Badge variant={tmpl.meta_template_id ? 'success' : 'warning'}>
                    {tmpl.meta_template_id ? 'META VERIFIED' : 'REGISTRY ONLY'}
                  </Badge>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-tight">
                  {tmpl.category} • {tmpl.language} • <span className="font-mono text-slate-400">{tmpl.meta_template_name}</span>
                </p>

                <div className="mt-3">
                  {tmpl.linked_event_key ? (
                    <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/10 px-2 py-1 rounded-lg w-fit">
                      <span className="text-[9px] text-green-500 font-bold uppercase tracking-wider">Linked Event:</span>
                      <span className="text-[10px] text-slate-300 font-mono">{tmpl.linked_event_key}</span>
                      {tmpl.is_mapping_enabled ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1" title="Automation Active" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 ml-1" title="Automation Paused" />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-slate-800/30 border border-slate-800/50 px-2 py-1 rounded-lg w-fit">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Status:</span>
                      <span className="text-[10px] text-slate-500 italic">Unmapped</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" className="text-xs" onClick={() => handleViewConfig(tmpl)}>
                  View
                </Button>
                <Button className="text-xs" onClick={() => handleLinkToEvent(tmpl)}>
                  {tmpl.linked_event_key ? 'Change Mapping' : 'Link to Event'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateViewModal isOpen={isModalOpen} template={selectedTemplate} onClose={() => setIsModalOpen(false)} />

      <CreateAutomationModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onCreated={() => {
          setIsLinkModalOpen(false);
          loadTemplates();
        }}
        storeId={selectedStoreId}
        initialTemplateId={targetTemplateId}
        initialEventKey={templates.find(t => t.id === targetTemplateId)?.linked_event_key}
      />
    </div>
  );
}

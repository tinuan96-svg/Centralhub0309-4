'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import CreateAutomationModal from '@/components/CreateAutomationModal';

export default function AutomationsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    if (selectedStoreId) loadAutomations();
  }, [selectedStoreId]);

  const loadAutomations = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('whatsapp_event_template_catalog')
        .select('*')
        .eq('store_id', selectedStoreId);
      setAutomations(data || []);
    } catch (err) {
      console.error('Load automations error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    if (!selectedStoreId) {
      alert('Please select a store first');
      return;
    }
    setIsCreateModalOpen(true);
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await supabase.from('whatsapp_event_template_mappings').update({ enabled: !current }).eq('id', id);
      loadAutomations();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this automation mapping? This will stop messages for this event.')) return;
    try {
      await supabase.from('whatsapp_event_template_mappings').delete().eq('id', id);
      loadAutomations();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Care Automations"
        subtitle="Manage event-driven WhatsApp communication rules."
        action={<Button onClick={handleCreateNew}>+ New Automation</Button>}
      />

      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      {!selectedStoreId ? (
        <div className="text-center py-10 text-slate-500 italic">Select a store to view its automations</div>
      ) : loading ? (
        <div className="text-center py-10 text-slate-500 animate-pulse">Loading automations...</div>
      ) : automations.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
          <p className="text-slate-500 text-sm">No automations found for this store.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {automations.map((auto) => (
            <Card key={auto.id} className="p-5 bg-slate-900/40 border-slate-800">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-slate-100 text-lg">{auto.description || auto.event_key}</h3>
                    <Badge variant={auto.enabled ? 'success' : 'warning'}>{auto.enabled ? 'Active' : 'Paused'}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-1">{auto.event_key}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="danger" className="text-xs" onClick={() => handleDelete(auto.id)}>Delete</Button>
                  <Button variant="secondary" className="text-xs" onClick={() => handleToggleActive(auto.id, auto.enabled)}>
                      {auto.enabled ? 'Pause' : 'Activate'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-black/20 p-4 rounded-xl border border-slate-800/50">
                <div className="space-y-3">
                  <section>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Trigger Source</h4>
                    <div className="flex items-center gap-2">
                       <Badge variant="info">{auto.event_source}</Badge>
                       <span className="text-[10px] text-slate-400 italic">via {auto.trigger_function || 'Direct Event'}</span>
                    </div>
                  </section>
                  <section>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</h4>
                    <div className="flex items-center gap-3">
                       <div className="flex items-center gap-1.5">
                         <div className={`w-1.5 h-1.5 rounded-full ${auto.channel_status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                         <span className="text-[10px] text-slate-300">Channel</span>
                       </div>
                       <div className="flex items-center gap-1.5">
                         <div className={`w-1.5 h-1.5 rounded-full ${auto.template_status === 'active' ? 'bg-green-500' : 'bg-amber-500'}`} />
                         <span className="text-[10px] text-slate-300">Template</span>
                       </div>
                    </div>
                  </section>
                </div>

                <div className="space-y-3">
                  <section>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Template Linked</h4>
                    <div className="flex flex-col">
                       <span className="text-sm text-slate-200 font-medium">{auto.template_name}</span>
                       <span className="text-[10px] text-slate-500">{auto.category} • {auto.language}</span>
                    </div>
                  </section>
                  <section>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Available Variables</h4>
                    <div className="flex flex-wrap gap-1">
                      {auto.variables && Array.isArray(auto.variables) && auto.variables.length > 0 ? (
                        auto.variables.map((v: string) => (
                          <span key={v} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50">
                            {v}
                          </span>
                        ))
                      ) : (
                        <span className="text-[9px] text-slate-600">No variables</span>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateAutomationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={loadAutomations}
        storeId={selectedStoreId}
      />
    </div>
  );
}

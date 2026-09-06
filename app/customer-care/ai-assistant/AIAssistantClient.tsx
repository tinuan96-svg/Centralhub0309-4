'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function AIAssistantClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (selectedStoreId) loadSettings(); }, [selectedStoreId]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('customer_care_settings').select('*').eq('store_id', selectedStoreId).maybeSingle();
      if (error) throw error;
      setSettings(data || { store_id: selectedStoreId, ai_enabled: true, ai_auto_reply: true, default_handling_mode: 'AI' });
    } catch (err) { console.error('Load settings error:', err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!selectedStoreId || !settings) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('customer_care_settings').upsert({ ...settings, store_id: selectedStoreId, updated_at: new Date().toISOString() }, { onConflict: 'store_id' });
      if (error) throw error;
      alert('Settings saved successfully.');
    } catch (err: any) {
      console.error('Save error:', err);
      alert(`Could not save AI settings: ${err?.message || 'Unknown error'}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader title="AI Assistant" subtitle="Configure AI behavior, tone, and automated response rules." />
      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl"><StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} /></div>
      <div className="max-w-2xl space-y-4">
        {!selectedStoreId ? <div className="text-center py-10 text-slate-500 italic">Select a store to configure its AI Assistant</div> : loading ? <div className="text-center py-10 text-slate-500 animate-pulse">Loading settings...</div> : (
          <Card className="p-4 sm:p-6 bg-slate-900/40 border-slate-800">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-bold text-slate-100">AI Enabled</h3><p className="text-xs text-slate-500">Allow AI to participate in conversations.</p></div><button onClick={() => setSettings({ ...settings, ai_enabled: !settings.ai_enabled })} className={`w-12 h-6 rounded-full relative border ${settings.ai_enabled ? 'bg-blue-600 border-blue-500' : 'bg-slate-800 border-slate-700'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full ${settings.ai_enabled ? 'right-1' : 'left-1'}`} /></button></div>
              <div className="flex items-center justify-between gap-4 pt-6 border-t border-slate-800/50"><div><h3 className="text-sm font-bold text-slate-100">AI Automatic Replies</h3><p className="text-xs text-slate-500">AI responds directly to customer enquiries.</p></div><button onClick={() => setSettings({ ...settings, ai_auto_reply: !settings.ai_auto_reply })} className={`w-12 h-6 rounded-full relative border ${settings.ai_auto_reply ? 'bg-green-600 border-green-500' : 'bg-slate-800 border-slate-700'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full ${settings.ai_auto_reply ? 'right-1' : 'left-1'}`} /></button></div>
              <div className="space-y-2 pt-6 border-t border-slate-800/50"><label className="text-xs font-bold text-slate-400">DEFAULT HANDLING MODE</label><select value={settings.default_handling_mode || 'AI'} onChange={e => setSettings({ ...settings, default_handling_mode: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"><option value="AI">AI Autopilot</option><option value="AI_DRAFT">AI Co-pilot (Draft Mode)</option><option value="HUMAN">Human Only</option></select></div>
              <div className="space-y-2 pt-6 border-t border-slate-800/50"><div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400">CUSTOM KNOWLEDGE</label><span className="text-[10px] text-slate-600 font-bold uppercase">Store Specific</span></div><textarea value={settings.custom_knowledge || ''} onChange={e => setSettings({ ...settings, custom_knowledge: e.target.value })} rows={6} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white" placeholder="Add store-specific information the AI should know..." /><p className="text-[10px] text-slate-500">This information is included in the AI context for this store.</p></div>
              <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save AI Configuration'}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

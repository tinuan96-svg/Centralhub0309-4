'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, Button, designTokens } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { marketingService } from '@/lib/services/marketing/marketingService';
import { Badge } from '@/lib/design-system/components/Badge';
import { MarketingSegment } from '@/lib/types/marketing';
import { supabase } from '@/lib/supabase';

export default function CustomerSegments({ params, searchParams }: { params: any; searchParams: any }) {
  const { selectedStore } = useStore();
  const [segments, setSegments] = useState<MarketingSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [intel, setIntel] = useState<any[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingSegment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', lifecycleStage: '', isActive: true });

  const loadSegments = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let intelQuery = supabase.from('customer_intelligence').select('lifecycle_stage');
      if (selectedStore?.id) intelQuery = intelQuery.eq('store_id', selectedStore.id);
      const [segData, intelData] = await Promise.all([
        marketingService.getSegments(selectedStore?.id),
        intelQuery
      ]);
      setSegments(segData);
      setIntel(intelData.data || []);
    } catch (err) {
      console.error('Failed to load segments:', err);
      setError(err instanceof Error ? err.message : 'Could not load live customer segments.');
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id]);

  const lifecycleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      new: 0, first_purchase: 0, active: 0, repeat: 0, loyal: 0, vip: 0, at_risk: 0, inactive: 0, churned: 0
    };
    intel.forEach(i => {
      if (counts[i.lifecycle_stage] !== undefined) counts[i.lifecycle_stage]++;
    });
    return counts;
  }, [intel]);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const openEditor = (segment?: MarketingSegment) => {
    setEditing(segment || null);
    setForm({
      name: segment?.name || '',
      description: segment?.description || '',
      lifecycleStage: String((segment?.rules as any)?.lifecycle_stage || ''),
      isActive: segment?.is_active !== false,
    });
    setError('');
    setEditorOpen(true);
  };

  const saveSegment = async () => {
    const storeId = selectedStore?.id;
    if (!storeId) { setError('Select a specific store before creating or editing a segment.'); return; }
    if (!form.name.trim()) { setError('Segment name is required.'); return; }
    setSaving(true); setError('');
    try {
      const memberCount = form.lifecycleStage ? lifecycleCounts[form.lifecycleStage] || 0 : intel.length;
      const payload = {
        store_id: storeId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        rules: { lifecycle_stage: form.lifecycleStage || null },
        member_count: memberCount,
        is_active: form.isActive,
        last_calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const query = editing
        ? supabase.from('marketing_segments').update(payload).eq('id', editing.id).eq('store_id', storeId)
        : supabase.from('marketing_segments').insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      setEditorOpen(false); setEditing(null); await loadSegments();
    } catch (err: any) {
      setError(err?.message || 'Could not save the segment.');
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Customer Segments"
        subtitle="Dynamic audiences based on order behavior and product interests."
      />

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-2">
        {Object.entries(lifecycleCounts).map(([stage, count]) => (
          <Card key={stage} className="p-3 bg-slate-900/40 border-slate-800 flex flex-col items-center justify-center">
            <p className="text-[8px] text-slate-500 font-black uppercase text-center mb-1">{stage.replace(/_/g, ' ')}</p>
            <p className="text-lg font-bold text-white">{count}</p>
          </Card>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4">
        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Custom Audience Segments</h3>
        <Button onClick={() => openEditor()} disabled={!selectedStore?.id}>+ Build Segment</Button>
      </div>

      {editorOpen && <Card className="p-5 bg-slate-900/60 border-blue-500/30 space-y-4">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-white uppercase tracking-widest">{editing ? 'Manage segment' : 'Build segment'}</h3><button onClick={() => setEditorOpen(false)} className="text-slate-500 hover:text-white" aria-label="Close segment editor">×</button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Segment name" className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white" />
          <select value={form.lifecycleStage} onChange={e => setForm({ ...form, lifecycleStage: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white"><option value="">All lifecycle stages</option>{Object.keys(lifecycleCounts).map(stage => <option key={stage} value={stage}>{stage.replace(/_/g, ' ')}</option>)}</select>
        </div>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" rows={3} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white" />
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Active segment</label>
        <div className="flex gap-2"><Button onClick={saveSegment} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update segment' : 'Create segment'}</Button><Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button></div>
      </Card>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full p-10 text-center text-slate-500 italic">Loading segments...</div>
        ) : segments.length === 0 ? (
          <div className="col-span-full p-10 text-center text-slate-500 italic border border-dashed border-slate-800 rounded-2xl">
             No custom segments found.
          </div>
        ) : (
          segments.map((segment) => (
            <Card key={segment.id} className="p-5 bg-slate-900/40 border-slate-800 flex flex-col justify-between hover:border-blue-500/30 transition-all cursor-pointer group">
               <div className="min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-3">
                     <h3 className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors truncate">{segment.name}</h3>
                     <Badge variant="info" className="text-[9px] shrink-0">{segment.member_count} Members</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-2 min-h-[2.5rem]">{segment.description || 'No description provided.'}</p>
               </div>

               <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                  <span className="text-[10px] text-slate-500 uppercase">
                    Last sync: {segment.last_calculated_at ? new Date(segment.last_calculated_at).toLocaleDateString() : 'Never'}
                  </span>
                  <Button variant="ghost" onClick={() => openEditor(segment)} className="text-[10px] h-7 px-3 border border-slate-700">Manage</Button>
               </div>
            </Card>
          ))

        )}
      </div>
    </div>
  );
}

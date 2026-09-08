'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

type Campaign = { id: string; name: string; status: string; provider_id: string; start_date?: string | null; end_date?: string | null; budget_amount?: number | null; currency?: string | null };
type View = 'month' | 'week' | 'list';

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const startOfWeek = (date: Date) => { const value = new Date(date); value.setDate(value.getDate() - value.getDay()); value.setHours(0, 0, 0, 0); return value; };

export default function MarketingCalendarClient() {
  const { selectedStore } = useStore();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [view, setView] = useState<View>('month');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let query = supabase.from('marketing_campaigns').select('id,name,status,provider_id,start_date,end_date,budget_amount,currency').order('start_date', { ascending: true });
      if (selectedStore?.id) query = query.eq('store_id', selectedStore.id);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setCampaigns(data || []);
    } catch (err: any) { setError(err?.message || 'Could not load live campaign dates.'); }
    finally { setLoading(false); }
  }, [selectedStore?.id]);

  useEffect(() => { void load(); }, [load]);

  const monthCells = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const count = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let day = 1; day <= count; day++) cells.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [currentMonth]);

  const campaignsForDate = (date: Date) => campaigns.filter(c => {
    const start = c.start_date ? dateKey(new Date(c.start_date)) : '';
    const end = c.end_date ? dateKey(new Date(c.end_date)) : start;
    const key = dateKey(date);
    return start && key >= start && key <= end;
  });

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => { const day = startOfWeek(currentMonth); day.setDate(day.getDate() + index); return day; }), [currentMonth]);
  const monthLabel = currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
    <div className="flex flex-wrap justify-between items-start gap-4"><PageHeader title="Marketing Calendar" subtitle="Campaign dates and planning records from Supabase." /><div className="flex gap-2"><Link href="/marketing/campaigns"><Button>Open Campaign Manager</Button></Link><button onClick={() => void load()} className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900">Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    <Card className="p-5 bg-slate-900/50 border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><div className="flex items-center gap-2"><button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="px-3 py-2 rounded-lg border border-slate-700">←</button><button onClick={() => setCurrentMonth(new Date())} className="px-4 py-2 rounded-lg border border-slate-700">Today</button><button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="px-3 py-2 rounded-lg border border-slate-700">→</button><h2 className="text-xl font-black ml-2">{monthLabel}</h2></div><div className="flex rounded-lg border border-slate-700 overflow-hidden">{(['month', 'week', 'list'] as View[]).map(item => <button key={item} onClick={() => setView(item)} className={`px-3 py-2 text-xs uppercase ${view === item ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>{item}</button>)}</div></div>
      {loading ? <div className="p-10 text-center text-slate-400">Loading live campaign dates…</div> : view === 'list' ? <div className="space-y-2">{campaigns.length === 0 ? <Empty /> : campaigns.map(c => <div key={c.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div><div className="font-bold">{c.name}</div><div className="text-xs text-slate-500">{c.provider_id} · {c.status}</div></div><div className="text-sm text-slate-300">{c.start_date ? new Date(c.start_date).toLocaleDateString('en-GB') : 'No start date'}{c.end_date ? ` – ${new Date(c.end_date).toLocaleDateString('en-GB')}` : ''}</div></div>)}</div> : view === 'week' ? <div className="grid grid-cols-1 md:grid-cols-7 gap-2">{weekDays.map(day => <div key={dateKey(day)} className="min-h-32 rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="text-xs font-bold text-slate-400">{day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</div>{campaignsForDate(day).map(c => <div key={c.id} className="mt-2 rounded-lg bg-blue-600/20 border border-blue-500/30 p-2 text-xs text-blue-100">{c.name}</div>)}</div>)}</div> : <div className="overflow-x-auto"><div className="grid grid-cols-7 min-w-[760px] border-l border-t border-slate-800">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="p-3 border-r border-b border-slate-800 text-xs font-black uppercase text-slate-500">{day}</div>)}{monthCells.map((day, index) => <div key={day ? dateKey(day) : `empty-${index}`} className={`min-h-28 border-r border-b border-slate-800 p-2 ${day && dateKey(day) === dateKey(new Date()) ? 'bg-blue-600/10' : 'bg-slate-950/30'}`}>{day && <><div className="text-xs font-bold text-slate-400">{day.getDate()}</div>{campaignsForDate(day).map(c => <div key={c.id} className="mt-2 rounded-lg bg-blue-600/20 border border-blue-500/30 p-2 text-xs text-blue-100 truncate" title={c.name}>{c.name}</div>)}</>}</div>)}</div></div>}
    </Card>
  </div>;
}

function Empty() { return <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center text-slate-500">No campaign dates have been recorded for this scope. Create one in Campaign Manager.</div>; }

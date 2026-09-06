'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_QUICK_ACTION_IDS,
  getQuickActions,
  MAX_QUICK_ACTIONS,
  QUICK_ACTION_CATALOG,
  QUICK_ACTION_STORAGE_KEY,
} from '@/lib/quickActions';

export default function QuickShortcutsSettings() {
  const [ids, setIds] = useState<string[]>(DEFAULT_QUICK_ACTION_IDS);
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(QUICK_ACTION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setIds(parsed.filter(id => typeof id === 'string'));
      }
    } catch {
      // Defaults are intentionally safe if local storage is unavailable.
    }
  }, []);

  const selected = useMemo(() => getQuickActions(ids), [ids]);
  const available = QUICK_ACTION_CATALOG.filter(action => !ids.includes(action.id));

  const persist = (next: string[]) => {
    setIds(next);
    try {
      window.localStorage.setItem(QUICK_ACTION_STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch {
      // Keep the in-memory state usable even if storage is blocked.
    }
  };

  const add = (id: string) => {
    if (ids.length >= MAX_QUICK_ACTIONS || ids.includes(id)) return;
    persist([...ids, id]);
  };

  const remove = (id: string) => persist(ids.filter(item => item !== id));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  };

  const reset = () => persist([...DEFAULT_QUICK_ACTION_IDS]);

  if (!mounted) return null;

  return (
    <section id="quick-shortcuts" className="scroll-mt-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Dashboard Quick Shortcuts</h3>
          <p className="text-sm text-slate-500">Choose the pages you need most often from the + button on the dashboard.</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="self-start sm:self-auto px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-white hover:border-cyan-500/40"
        >
          Reset defaults
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-400">Your shortcuts</p>
            <p className="text-[11px] text-slate-500 mt-1">{ids.length}/{MAX_QUICK_ACTIONS} selected · top item appears first</p>
          </div>
          {saved && <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Saved</span>}
        </div>

        <div className="divide-y divide-slate-800/80">
          {selected.map((action, index) => (
            <div key={action.id} className="p-3 sm:p-4 flex items-center gap-3">
              <span className="text-xl w-8 text-center" aria-hidden>{action.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{action.label}</p>
                <p className="text-[11px] text-slate-500 truncate">{action.description}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${action.label} up`} className="h-9 w-9 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-25">↑</button>
                <button type="button" disabled={index === selected.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${action.label} down`} className="h-9 w-9 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-25">↓</button>
                <button type="button" onClick={() => remove(action.id)} aria-label={`Remove ${action.label}`} className="h-9 w-9 rounded-lg border border-rose-900/50 text-rose-400">×</button>
              </div>
            </div>
          ))}
          {selected.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No shortcuts selected. Add one below.</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-300">Add a page</p>
          <p className="text-[11px] text-slate-500 mt-1">Only existing CentralHub routes are offered, so shortcuts cannot point to a broken page.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {available.map(action => (
            <button
              key={action.id}
              type="button"
              disabled={ids.length >= MAX_QUICK_ACTIONS}
              onClick={() => add(action.id)}
              className="text-left p-3 rounded-xl border border-slate-800 bg-slate-950/70 hover:border-cyan-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <span className="mr-2" aria-hidden>{action.icon}</span>
              <span className="text-xs font-bold text-white">{action.label}</span>
              <span className="block text-[10px] text-slate-500 mt-1 ml-6">{action.group} · {action.description}</span>
            </button>
          ))}
        </div>
        {ids.length >= MAX_QUICK_ACTIONS && <p className="text-[10px] text-amber-400 mt-3">You have reached the mobile-friendly limit of {MAX_QUICK_ACTIONS} shortcuts. Remove one to add another.</p>}
      </div>
    </section>
  );
}

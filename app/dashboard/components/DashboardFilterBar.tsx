'use client';

import { useDashboardFilterStore, TimeRange, ComparisonType } from '@/lib/store/dashboardFilterStore';
import { useStore } from '@/lib/store/useStore';
import { useState } from 'react';

export default function DashboardFilterBar({ lastUpdated }: { lastUpdated: Date | null }) {
  const {
    timeRange, setTimeRange,
    comparisonType, setComparisonType,
    selectedStoreId, setSelectedStoreId,
    customStartDate, customEndDate, setCustomDates
  } = useDashboardFilterStore();

  const { stores } = useStore();
  const [showCustom, setShowCustom] = useState(false);

  const ranges: { value: TimeRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7days', label: 'Week' },
    { value: '30days', label: 'Month' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800/50 p-4 rounded-2xl shadow-xl">
        <div className="flex flex-wrap items-center gap-6">
          {/* Time Range */}
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Scope</p>
            <div className="flex bg-slate-950 p-1 rounded-xl">
              {ranges.map(r => (
                <button
                  key={r.value}
                  onClick={() => {
                    setTimeRange(r.value);
                    if (r.value === 'custom') setShowCustom(true);
                    else setShowCustom(false);
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                    timeRange === r.value
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Store Selection */}
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Network</p>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold uppercase text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="all">🌐 All Stores</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>🏪 {s.name}</option>
              ))}
            </select>
          </div>

          {/* Comparison */}
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Analysis</p>
            <select
              value={comparisonType}
              onChange={(e) => setComparisonType(e.target.value as ComparisonType)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold uppercase text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="none">No Comparison</option>
              <option value="previous">Previous Period</option>
              <option value="lastYear">Same Period Last Year</option>
            </select>
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col items-end">
           <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live Engine</span>
           </div>
           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
             Last Refreshed: {lastUpdated ? lastUpdated.toLocaleTimeString('en-GB') : '---'}
           </p>
        </div>
      </div>

      {showCustom && (
        <div className="flex items-end gap-4 p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl animate-in slide-in-from-top-2">
           <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Start Date</label>
              <input
                type="date"
                value={customStartDate || ''}
                onChange={e => setCustomDates(e.target.value, customEndDate)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
              />
           </div>
           <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">End Date</label>
              <input
                type="date"
                value={customEndDate || ''}
                onChange={e => setCustomDates(customStartDate, e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
              />
           </div>
           <button
             onClick={() => setShowCustom(false)}
             className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-cyan-900/20"
           >
             Lock Dates
           </button>
        </div>
      )}
    </div>
  );
}

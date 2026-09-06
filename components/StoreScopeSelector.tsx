'use client';

import { useStore } from '@/lib/store/useStore';
import { designTokens, getInputClasses } from '@/lib/design-system';

interface StoreScopeSelectorProps {
  value: string | null;
  onStoreChange: (storeId: string | null) => void;
  className?: string;
}

export default function StoreScopeSelector({ value, onStoreChange, className = '' }: StoreScopeSelectorProps) {
  const { stores } = useStore();

  const selectedStoreName = value
    ? stores.find(s => s.id === value)?.name || 'Unknown Store'
    : 'All Stores';

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 ${className}`}>
      <span className={`text-xs font-black uppercase tracking-widest ${designTokens.colors.text.secondary}`}>
        Store Scope:
      </span>
      <div className="relative">
        <select
          value={value || ''}
          onChange={(e) => onStoreChange(e.target.value || null)}
          className={`text-sm font-bold pr-10 min-w-[160px] ${getInputClasses()} !bg-slate-900/50 border-slate-700/50 hover:border-cyan-500/30 transition-all`}
        >
          <option value="">🌐 All Stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              🏪 {store.name}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      <div className="hidden sm:block h-4 w-px bg-slate-800 mx-2" />
      <span className="text-[10px] font-black text-cyan-400 uppercase tracking-tighter">
        {selectedStoreName}
      </span>
    </div>
  );
}

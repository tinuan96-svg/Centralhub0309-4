'use client';

import { useState, useEffect, useRef } from 'react';
import { SearchService, SearchResult } from '@/lib/services/system/searchService';
import { useRouter } from 'next/navigation';

export default function GlobalSearchOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true);
        const data = await SearchService.globalSearch(query);
        setResults(data);
        setLoading(false);
        setActiveIndex(0);
      } else {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (results.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex(prev => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex(prev => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleNavigate(results[activeIndex].url);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, activeIndex, onClose]);

  const handleNavigate = (url: string) => {
    router.push(url);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-800 flex items-center gap-4">
           <span className="text-2xl">🔍</span>
           <input
             ref={inputRef}
             value={query}
             onChange={e => setQuery(e.target.value)}
             placeholder="Search Products, SKU, Orders, Customers... (Ctrl+K)"
             className="flex-1 bg-transparent text-xl font-bold text-white outline-none placeholder-slate-700"
           />
           {loading && <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />}
           <div className="px-2 py-1 bg-slate-800 rounded-lg text-[10px] font-black text-slate-500 border border-slate-700 uppercase tracking-widest">ESC</div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
           {results.length > 0 ? (
             <div className="space-y-1">
                {results.map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => handleNavigate(r.url)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl text-left transition-all ${
                      i === activeIndex ? 'bg-cyan-600 shadow-lg shadow-cyan-900/20' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                         i === activeIndex ? 'bg-white/20' : 'bg-slate-800'
                       }`}>
                         {r.type === 'order' ? '🛒' : r.type === 'product' ? '📦' : r.type === 'customer' ? '👤' : '🏪'}
                       </div>
                       <div>
                          <p className={`font-black uppercase tracking-tight ${i === activeIndex ? 'text-white' : 'text-slate-100'}`}>{r.title}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${i === activeIndex ? 'text-cyan-100' : 'text-slate-500'}`}>{r.subtitle}</p>
                       </div>
                    </div>
                    {i === activeIndex && <span className="text-white font-black text-[10px] uppercase tracking-widest">Open ↵</span>}
                  </button>
                ))}
             </div>
           ) : query.length >= 2 ? (
             <div className="py-12 text-center">
                <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No matches found for &quot;{query}&quot;</p>
             </div>
           ) : (
             <div className="py-12 text-center space-y-4">
                <p className="text-slate-600 font-bold uppercase tracking-[0.2em] text-[10px]">Recent Searches</p>
                <div className="flex flex-wrap justify-center gap-2 px-8">
                   {['#KG2501', 'Red Rice', 'Mallu Spices', 'Pocket Grocery'].map(s => (
                     <button key={s} onClick={() => setQuery(s)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold uppercase rounded-lg border border-slate-700">{s}</button>
                   ))}
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

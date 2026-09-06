'use client';

import { useState, useEffect, useCallback } from 'react';
import { InventoryLog, MovementType } from '@/lib/types';
import { InventoryService } from '@/lib/services/inventoryService';
import { designTokens } from '@/lib/design-system';

const MOVEMENT_STYLES: Record<MovementType, { label: string; color: string; icon: string }> = {
  IN: { label: 'Stock In', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: '🟢' },
  OUT: { label: 'Stock Out', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', icon: '🔴' },
  ADJUSTMENT: { label: 'Adjustment', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: '🟡' },
  TRANSFER: { label: 'Transfer', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: '🔵' },
};

export default function InventoryActivityLog() {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterTime, setFilterTime] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<InventoryLog | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateFrom = filterTime === 'today'
        ? new Date(new Date().setHours(0,0,0,0)).toISOString()
        : filterTime === '7days'
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const [l, s] = await Promise.all([
        InventoryService.getInventoryLogs(undefined, 100, {
          type: filterType === 'all' ? undefined : filterType,
          dateFrom,
          search: searchQuery
        }),
        InventoryService.getInventoryStats()
      ]);
      setLogs(l);
      setStats(s);
    } catch (error) {
      console.error('Error loading inventory activity:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterTime, searchQuery]);



  useEffect(() => {
    loadData();
  }, [loadData]);

  const getTimeDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Stock In Today', value: stats?.stockInToday || 0, color: 'text-emerald-400', icon: '📦', prefix: '+' },
          { label: 'Stock Out Today', value: stats?.stockOutToday || 0, color: 'text-rose-400', icon: '📤', prefix: '-' },
          { label: 'Adjustments', value: stats?.adjustmentsToday || 0, color: 'text-amber-400', icon: '🔄' },
          { label: 'Transfers', value: stats?.transfersToday || 0, color: 'text-blue-400', icon: '🚚' },
          { label: 'Low Stock', value: stats?.lowStockCount || 0, color: 'text-yellow-400', icon: '⚠️' },
          { label: 'Out of Stock', value: stats?.outOfStockCount || 0, color: 'text-red-500', icon: '❌' },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-xl mb-1">{stat.icon}</span>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">{stat.label}</p>
            <p className={`text-xl font-black ${stat.color}`}>
              {stat.prefix}{stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Activity Log Card */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">Stock Activity Trail</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search SKU, Order..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-48"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
            </div>

            <div className="flex bg-slate-800 p-1 rounded-xl">
              {[
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: '7days', label: '7 Days' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilterTime(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${filterTime === t.id ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[10px] font-bold uppercase text-slate-300 focus:outline-none"
            >
              <option value="all">All Activity</option>
              <option value="IN">Stock In</option>
              <option value="OUT">Stock Out</option>
              <option value="ADJUSTMENT">Adjustments</option>
              <option value="TRANSFER">Transfers</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/30 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Movement</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 uppercase font-black tracking-widest animate-pulse">
                    Loading Activity Trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 uppercase font-bold tracking-widest">
                    No activity found for selected filters
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const style = MOVEMENT_STYLES[log.movement_type] || MOVEMENT_STYLES.ADJUSTMENT;
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-xs font-mono text-slate-400 group-hover:text-slate-200 transition-colors">{getTimeDisplay(log.created_at)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <p className="text-sm font-bold text-slate-200 group-hover:text-cyan-400 transition-colors line-clamp-1">{log.product_name}</p>
                          <p className="text-[10px] font-mono text-slate-500 uppercase">{log.sku || 'No SKU'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className={`text-sm font-black ${log.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {log.change > 0 ? '+' : ''}{log.change}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">{log.old_quantity} → {log.new_quantity}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${style.color}`}>
                          <span>{style.icon}</span>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-medium text-slate-300">{log.reference_type || 'Manual'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-mono text-slate-400 group-hover:text-slate-200 transition-colors">{log.reference_number || log.reference_id || '—'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-medium text-slate-400">{log.edited_by || 'System'}</p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Side Panel (Detail View) */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)} />
          <div className="relative w-full max-w-md bg-slate-900 h-full shadow-2xl border-l border-slate-800 animate-slide-in-right overflow-y-auto">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md z-10">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter">Activity Details</h3>
              <button onClick={() => setSelectedLog(null)} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all">✕</button>
            </div>

            <div className="p-8 space-y-8">
              {/* Product Info */}
              <div className="space-y-4">
                <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Product Details</p>
                  <h4 className="text-xl font-black text-white leading-tight mb-2">{selectedLog.product_name}</h4>
                  <p className="text-sm font-mono text-cyan-400">{selectedLog.sku || 'No SKU Associated'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time</p>
                    <p className="text-sm font-mono text-slate-200">{new Date(selectedLog.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                    <p className="text-[10px] text-slate-500">{new Date(selectedLog.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Movement</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${MOVEMENT_STYLES[selectedLog.movement_type]?.color || ''}`}>
                      {selectedLog.movement_type}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stock Change */}
              <div className="bg-slate-950 rounded-3xl p-8 border border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl">📊</div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Stock Transaction</p>

                <div className="flex items-center justify-between relative">
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Before</p>
                    <p className="text-3xl font-black text-slate-400">{selectedLog.old_quantity}</p>
                  </div>

                  <div className="flex flex-col items-center px-4">
                    <div className={`text-lg font-black ${selectedLog.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selectedLog.change > 0 ? '↑' : '↓'} {Math.abs(selectedLog.change)}
                    </div>
                    <div className="w-12 h-0.5 bg-slate-800 my-1" />
                  </div>

                  <div className="text-center flex-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">After</p>
                    <p className="text-3xl font-black text-cyan-400">{selectedLog.new_quantity}</p>
                  </div>
                </div>
              </div>

              {/* Reference */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Transaction Source</h5>
                <div className="divide-y divide-slate-800 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 flex justify-between items-center">
                    <span className="text-xs text-slate-500">Source Type</span>
                    <span className="text-sm font-bold text-slate-200">{selectedLog.reference_type}</span>
                  </div>
                  <div className="px-6 py-4 flex justify-between items-center">
                    <span className="text-xs text-slate-500">Reference #</span>
                    <span className="text-sm font-mono font-bold text-cyan-400">{selectedLog.reference_number || 'N/A'}</span>
                  </div>
                  <div className="px-6 py-4 flex justify-between items-center">
                    <span className="text-xs text-slate-500">User / System</span>
                    <span className="text-sm font-bold text-slate-200">{selectedLog.edited_by || 'Automated System'}</span>
                  </div>
                  {selectedLog.notes && (
                    <div className="px-6 py-4 space-y-2">
                      <span className="text-xs text-slate-500">Audit Notes</span>
                      <p className="text-sm text-slate-400 leading-relaxed italic">&quot;{selectedLog.notes}&quot;</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-widest rounded-2xl transition-all"
              >
                Close Trail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

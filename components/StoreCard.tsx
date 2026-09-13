import { memo, useMemo, useCallback } from 'react';
import { StoreStats } from '@/lib/services/storeStatsService';
import StoreBadge from './StoreBadge';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import Sparkline from './Sparkline';

interface StoreCardProps {
  stats: StoreStats;
}

const StoreCard = memo(({ stats }: StoreCardProps) => {
  const router = useRouter();
  const { setSelectedStore } = useStore();

  const formatCurrency = useCallback((amount: number) => `£${Number(amount).toFixed(2)}`, []);

  const handleClick = useCallback(() => {
    setSelectedStore({
      id: stats.storeId,
      name: stats.storeName,
      slug: stats.storeSlug,
      max_display_stock: 5,
      created_at: '',
    });
    router.push(`/stores/${stats.storeId}`);
  }, [stats.storeId, stats.storeName, stats.storeSlug, router, setSelectedStore]);

  const { healthPercentage, healthColor, glowColor } = useMemo(() => {
    const total = stats.activeProducts;
    const atRisk = stats.lowStockCount + stats.outOfStockCount;
    const healthy = Math.max(0, total - atRisk);
    const percentage = total > 0 ? (healthy / total) * 100 : 100;

    const color = percentage >= 90 ? 'emerald' : percentage >= 70 ? 'orange' : 'rose';
    const glow = stats.storeSlug === 'kutcherry-general-store' ? 'cyan' : 'blue';

    return {
      healthPercentage: percentage,
      healthColor: color,
      glowColor: glow,
    };
  }, [stats.activeProducts, stats.lowStockCount, stats.outOfStockCount, stats.storeSlug]);

  const trendColor = stats.revenueGrowth >= 0 ? '#10b981' : '#f43f5e';

  return (
    <div
      onClick={handleClick}
      className={`relative min-w-0 bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-4 hover:border-${glowColor}-500/50 hover:shadow-2xl hover:shadow-${glowColor}-500/10 transition-all duration-300 cursor-pointer group hover:scale-[1.01]`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className={`text-base font-black text-slate-100 uppercase tracking-tight truncate group-hover:text-${glowColor}-400 transition-colors`}>
            {stats.storeName}
          </h3>
          <div className="flex items-center gap-2 mt-1 min-w-0">
             <StoreBadge
               store={{ name: stats.storeName, slug: stats.storeSlug }}
               size="sm"
             />
             <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{stats.storeSlug}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
           <div className={`flex items-center justify-end gap-1 text-xs font-bold ${stats.revenueGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span>{stats.revenueGrowth >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(stats.revenueGrowth).toFixed(1)}%</span>
           </div>
           <p className="text-[9px] text-slate-500 uppercase font-black tracking-tighter mt-0.5">7D paid sales</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Paid revenue</p>
          <p className="text-sm sm:text-lg font-black text-amber-400 truncate">{formatCurrency(stats.totalRevenue)}</p>
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Orders</p>
          <p className="text-sm sm:text-lg font-black text-cyan-400">{stats.totalOrders}</p>
          <p className="text-[9px] text-slate-600 font-bold">{stats.paidOrders} paid</p>
        </div>
        <div className="min-w-0 space-y-0.5" title="CentralHub-approved and published products allowed for this store">
           <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Live catalog</p>
           <p className="text-sm sm:text-lg font-black text-blue-400">{stats.activeProducts}</p>
           {stats.activeProducts !== stats.totalProducts && <p className="text-[9px] text-slate-600 font-bold">of {stats.totalProducts}</p>}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 h-12">
         <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[10px] mb-1.5 font-bold uppercase tracking-tight">
               <span className="text-slate-500">Shared stock health</span>
               <span className={`num ${healthColor === 'emerald' ? 'text-emerald-400' : healthColor === 'orange' ? 'text-amber-400' : 'text-rose-400'}`}>
                 {healthPercentage.toFixed(0)}%
               </span>
            </div>
            <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
               <div
                 className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${
                   healthColor === 'emerald'
                     ? 'from-emerald-600 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                     : healthColor === 'orange'
                     ? 'from-amber-600 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                     : 'from-rose-600 to-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                 }`}
                 style={{ width: `${healthPercentage}%` }}
               />
            </div>
         </div>
         <div className="shrink-0 bg-slate-950/30 rounded-xl p-2 border border-slate-800/30 hidden xs:block">
            <Sparkline data={stats.revenueTrend} color={trendColor} width={72} height={30} />
         </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/50 flex items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap min-w-0">
           {stats.lowStockCount > 0 && (
             <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-black uppercase">{stats.lowStockCount} Low</span>
           )}
           {stats.outOfStockCount > 0 && (
             <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 font-black uppercase">{stats.outOfStockCount} OOS</span>
           )}
           {stats.pendingOrders > 0 && (
             <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-black uppercase">{stats.pendingOrders} PND</span>
           )}
           {stats.failedOrders > 0 && (
             <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-black uppercase">{stats.failedOrders} Failed</span>
           )}
        </div>
        <p className={`shrink-0 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-${glowColor}-400 group-hover:text-${glowColor}-300 transition-colors`}>
          Manage →
        </p>
      </div>
    </div>
  );
});

StoreCard.displayName = 'StoreCard';

export default StoreCard;

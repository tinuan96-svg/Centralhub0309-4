'use client';

import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';

interface KpiData {
  totalRevenue: number;
  actualGrossProfit: number;
  totalOverhead: number;
  netProfit: number;
  totalInventoryValue: number;
  totalOrders: number;
  pendingOrders: number;
}

interface KpiGridProps {
  current: KpiData;
  previous: KpiData | null;
}

export default function DashboardKpiGrid({ current, previous }: KpiGridProps) {
  const { comparisonType } = useDashboardFilterStore();

  const calculateChange = (cur: number, prev: number | undefined) => {
    if (comparisonType === 'none' || prev === undefined || prev === 0) return null;
    const percentage = ((cur - prev) / prev) * 100;
    return {
      percentage: Math.abs(percentage).toFixed(1),
      isPositive: percentage >= 0
    };
  };

  const KpiCard = ({ label, value, prev, icon, accent, invert = false, sub }: any) => {
    const change = calculateChange(value, prev);
    const showEmerald = invert ? !change?.isPositive : change?.isPositive;

    return (
      <div className={`group relative rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 p-5 hover:border-${accent}-500/50 hover:shadow-2xl hover:shadow-${accent}-500/10 transition-all duration-300 overflow-hidden`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{label}</p>
          <span className="text-xl opacity-50 group-hover:opacity-100 transition-opacity">{icon}</span>
        </div>
        <div className="flex flex-col gap-1">
          <p className={`text-2xl font-black text-${accent}-400 truncate`}>
            {typeof value === 'number' && label !== 'Orders' ? formatCurrency(value) : value}
          </p>
          <div className="flex items-center justify-between">
            {change ? (
              <div className={`flex items-center gap-1 text-[10px] font-bold ${showEmerald ? 'text-emerald-400' : 'text-rose-400'}`}>
                <span>{change.isPositive ? '↑' : '↓'}</span>
                <span>{change.percentage}%</span>
                <span className="text-slate-600 ml-1 font-medium">vs prev</span>
              </div>
            ) : <div className="h-4" />}
            {sub && <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80">{sub}</p>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <KpiCard label="Revenue" value={current.totalRevenue} prev={previous?.totalRevenue} icon="💰" accent="amber" />
      <KpiCard label="Gross Profit" value={current.actualGrossProfit} prev={previous?.actualGrossProfit} icon="💎" accent="emerald" />
      <KpiCard label="Overhead" value={current.totalOverhead} prev={previous?.totalOverhead} icon="🏢" accent="rose" invert />
      <KpiCard label="Net Profit" value={current.netProfit} prev={previous?.netProfit} icon="🏦" accent="indigo" />
      <KpiCard label="Inventory Value" value={current.totalInventoryValue} icon="🏗️" accent="blue" />
      <KpiCard label="Orders" value={current.totalOrders} prev={previous?.totalOrders} icon="📦" accent="cyan" sub={current.pendingOrders > 0 ? `${current.pendingOrders} PENDING` : null} />
    </div>
  );
}

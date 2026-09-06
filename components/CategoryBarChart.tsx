'use client';

import { useRef, useEffect, useState, memo, useMemo } from 'react';

export interface BarChartData {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
}

interface CategoryBarChartProps {
  data: BarChartData[];
  title?: string;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#a855f7', '#0ea5e9', '#65a30d', '#d946ef',
];

const CategoryBarChart = memo(({ data, title = 'Category Sales' }: CategoryBarChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 10), [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    const labelWidth = 140;
    const padding = { top: 10, right: 80, bottom: 10, left: labelWidth };
    const chartWidth = rect.width - padding.left - padding.right;
    const barHeight = Math.min(32, (rect.height - padding.top - padding.bottom) / data.length - 4);
    const gap = ((rect.height - padding.top - padding.bottom) - barHeight * data.length) / Math.max(data.length - 1, 1);

    data.forEach((item, i) => {
      const y = padding.top + i * (barHeight + gap);
      const barW = (item.value / maxValue) * chartWidth;
      const color = item.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = item.label.length > 18 ? item.label.slice(0, 17) + '...' : item.label;
      ctx.fillText(label, padding.left - 8, y + barHeight / 2);

      ctx.fillStyle = color + '33';
      ctx.fillRect(padding.left, y, chartWidth, barHeight);

      const grad = ctx.createLinearGradient(padding.left, y, padding.left + barW, y);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + 'cc');
      ctx.fillStyle = grad;
      ctx.fillRect(padding.left, y, Math.max(barW, 2), barHeight);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const valText = item.value >= 1000 ? `£${(item.value / 1000).toFixed(1)}k` : `£${item.value.toFixed(0)}`;
      ctx.fillText(valText, padding.left + barW + 6, y + barHeight / 2);
    });
  }, [data, maxValue]);

  const formatCurrency = (n: number) => `£${n.toFixed(2)}`;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6">
      <h3 className="text-base font-semibold text-slate-200 mb-4">{title}</h3>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No category data available</div>
      ) : (
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{ width: '100%', height: `${Math.max(data.length * 40, 120)}px` }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const barHeight = Math.min(32, (rect.height - 20) / data.length - 4);
              const gap = ((rect.height - 20) - barHeight * data.length) / Math.max(data.length - 1, 1);
              const index = Math.floor((y - 10) / (barHeight + gap));
              if (index >= 0 && index < data.length) setHovered(index);
              else setHovered(null);
            }}
            onMouseLeave={() => setHovered(null)}
          />
          {hovered !== null && data[hovered] && (
            <div className="absolute top-2 right-2 bg-slate-900 border border-slate-700 text-white text-xs rounded-xl p-3 pointer-events-none z-50 shadow-2xl min-w-[140px]">
              <div className="font-bold text-slate-400 mb-1 border-b border-slate-800 pb-1 uppercase tracking-wider text-[10px]">
                {data[hovered].label}
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-300">Revenue</span>
                <span className="font-bold text-amber-400">{formatCurrency(data[hovered].value)}</span>
              </div>
              {data[hovered].secondaryValue !== undefined && (
                <div className="flex justify-between gap-4 mt-1">
                  <span className="text-slate-300">Profit</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(data[hovered].secondaryValue!)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

CategoryBarChart.displayName = 'CategoryBarChart';
export default CategoryBarChart;

'use client';

import { useEffect, useRef, useState, memo, useMemo, useCallback } from 'react';

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  data: { date: string; value: number }[];
}

interface TimeSeriesChartProps {
  series: ChartSeries[];
  timeRange: string;
}

const TimeSeriesChart = memo(({ series, timeRange }: TimeSeriesChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visibleSeriesIds, setVisibleSeriesIds] = useState<Set<string>>(new Set());
  const [hoveredInfo, setHoveredPoint] = useState<{ date: string; points: { name: string; color: string; value: number }[]; x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Initialize visible series
  useEffect(() => {
    if (series.length > 0 && visibleSeriesIds.size === 0) {
      setVisibleSeriesIds(new Set(series.map(s => s.id)));
    }
  }, [series, visibleSeriesIds.size]);

  const toggleSeries = (id: string) => {
    const next = new Set(visibleSeriesIds);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setVisibleSeriesIds(next);
  };

  const formatCurrency = (amount: number) => `£${Number(amount).toFixed(2)}`;

  // All unique dates across all series, sorted
  const allDates = useMemo(() => {
    const dates = new Set<string>();
    series.forEach(s => s.data.forEach(d => dates.add(d.date)));
    return Array.from(dates).sort();
  }, [series]);

  const formatDate = useCallback((dateStr: string) => {
    if (!mounted) return '...';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  }, [mounted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allDates.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = rect.width - padding.left - padding.right;
    const chartHeight = rect.height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Grid lines
    ctx.strokeStyle = '#334155'; // slate-700
    ctx.lineWidth = 0.5;
    const gridRows = 5;
    for (let i = 0; i <= gridRows; i++) {
        const y = padding.top + (i / gridRows) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
    }

    const maxValue = Math.max(...series.flatMap(s => s.data.map(d => d.value)), 10);
    const visibleSeries = series.filter(s => visibleSeriesIds.has(s.id));

    visibleSeries.forEach(s => {
      const points: { x: number; y: number }[] = allDates.map((date, i) => {
        const d = s.data.find(dp => dp.date === date);
        const val = d ? d.value : 0;
        const x = padding.left + (i / (allDates.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - (val / maxValue) * chartHeight;
        return { x, y };
      });

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw shadow/glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = s.color + '44';

      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
            const prev = points[i - 1];
            const cpx = (prev.x + p.x) / 2;
            ctx.bezierCurveTo(cpx, prev.y, cpx, p.y, p.x, p.y);
        }
      });
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Draw dots
      points.forEach((p) => {
        ctx.fillStyle = '#0f172a'; // slate-950
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });

    // X-Axis labels
    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const step = Math.ceil(allDates.length / 6);
    allDates.forEach((date, i) => {
      if (i % step === 0 || i === allDates.length - 1) {
        const x = padding.left + (i / (allDates.length - 1)) * chartWidth;
        ctx.fillText(formatDate(date), x, padding.top + chartHeight + 25);
      }
    });

    // Y-Axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridRows; i++) {
        const val = maxValue - (i / gridRows) * maxValue;
        const y = padding.top + (i / gridRows) * chartHeight + 4;
        ctx.fillText(val >= 1000 ? `£${(val/1000).toFixed(1)}k` : `£${val.toFixed(0)}`, padding.left - 10, y);
    }

  }, [series, visibleSeriesIds, allDates, timeRange, formatDate]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || allDates.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = { left: 60, right: 20 };
    const chartWidth = rect.width - padding.left - padding.right;

    const index = Math.round(((x - padding.left) / chartWidth) * (allDates.length - 1));

    if (index >= 0 && index < allDates.length) {
      const date = allDates[index];
      const points = series
        .filter(s => visibleSeriesIds.has(s.id))
        .map(s => {
          const d = s.data.find(dp => dp.date === date);
          return { name: s.name, color: s.color, value: d ? d.value : 0 };
        })
        .sort((a, b) => b.value - a.value);

      setHoveredPoint({ date, points, x: e.clientX, y: e.clientY });
    } else {
      setHoveredPoint(null);
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h3 className="text-base font-semibold text-slate-200">Revenue per Store</h3>
        <div className="flex flex-wrap gap-2">
          {series.map(s => (
            <button
              key={s.id}
              onClick={() => toggleSeries(s.id)}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                visibleSeriesIds.has(s.id)
                  ? 'bg-slate-800 text-white border-slate-700'
                  : 'bg-transparent text-slate-500 border-transparent grayscale'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }}></span>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredPoint(null)}
          className="w-full h-80 cursor-crosshair"
          style={{ width: '100%', height: '320px' }}
        />

        {hoveredInfo && (
          <div
            className="fixed bg-slate-900 border border-slate-700 text-white text-xs rounded-xl p-3 pointer-events-none z-50 shadow-2xl min-w-[140px]"
            style={{
              left: `${hoveredInfo.x + 20}px`,
              top: `${hoveredInfo.y - 20}px`,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="font-bold text-slate-400 mb-2 border-b border-slate-800 pb-1 uppercase tracking-wider text-[10px]">
                {mounted ? new Date(hoveredInfo.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '...'}
            </div>
            <div className="space-y-2">
              {hoveredInfo.points.map(p => (
                <div key={p.name} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }}></span>
                    <span className="text-slate-300">{p.name}</span>
                  </div>
                  <span className="font-bold text-amber-400">{formatCurrency(p.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

TimeSeriesChart.displayName = 'TimeSeriesChart';

export default TimeSeriesChart;

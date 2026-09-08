import { ReactNode } from 'react';
import { designTokens, getCardClasses } from '../tokens';

interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: number; isPositive: boolean } | string;
  change?: number;
  description?: string;
  className?: string;
  variant?: string;
}

export function StatCard({ label, title, value, icon, trend, change, description, className = '', variant: _variant }: StatCardProps) {
  const trendText = typeof trend === 'string' ? trend : trend ? `${trend.isPositive ? '+' : '-'}${Math.abs(trend.value).toFixed(1)}%` : change != null ? `${change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(1)}%` : null;
  const trendPositive = typeof trend === 'string' ? !trend.trim().startsWith('-') : trend ? trend.isPositive : (change ?? 0) >= 0;
  return (
    <div className={`ch-kpi ${getCardClasses('default')} ${designTokens.spacing.card} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className={designTokens.typography.metricLabel}>{label ?? title}</p>
          <p className={`${designTokens.typography.metric} mt-2`}>{value}</p>
          {description && <p className={`${designTokens.typography.body} mt-1`}>{description}</p>}
          {trendText && <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendPositive ? designTokens.colors.status.success : designTokens.colors.status.danger}`}><span>{trendPositive ? '↑' : '↓'}</span><span>{trendText}</span></div>}
        </div>
        {icon && <div className="ch-kpi-icon ml-3">{icon}</div>}
      </div>
    </div>
  );
}

interface StatGridProps { children: ReactNode; columns?: 2 | 3 | 4 | 5; className?: string; }
export function StatGrid({ children, columns = 3, className = '' }: StatGridProps) {
  const gridCols = { 2: 'grid-cols-1 xs:grid-cols-2', 3: 'grid-cols-1 xs:grid-cols-2 fold-inner:grid-cols-3', 4: 'grid-cols-1 xs:grid-cols-2 fold-inner:grid-cols-4', 5: 'grid-cols-1 xs:grid-cols-2 fold-inner:grid-cols-5' };
  return <div className={`grid ${gridCols[columns]} ${designTokens.spacing.grid} ${className}`}>{children}</div>;
}

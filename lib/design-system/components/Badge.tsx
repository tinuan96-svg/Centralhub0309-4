import { ReactNode } from 'react';
import { getBadgeClasses } from '../tokens';

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'error' | 'secondary' | 'info' | 'pending' | 'paid' | 'failed';
  className?: string;
}

export function Badge({ children, variant = 'info', className = '' }: BadgeProps) {
  const resolvedVariant = variant === 'error' ? 'danger' : variant === 'secondary' ? 'info' : variant;
  return <span className={`${getBadgeClasses(resolvedVariant)} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.toLowerCase();
  let variant: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'paid' | 'failed' = 'info';
  if (normalizedStatus.includes('paid') || normalizedStatus.includes('completed') || normalizedStatus.includes('confirmed')) variant = 'paid';
  else if (normalizedStatus.includes('pending') || normalizedStatus.includes('processing')) variant = 'pending';
  else if (normalizedStatus.includes('failed') || normalizedStatus.includes('cancelled') || normalizedStatus.includes('rejected')) variant = 'failed';
  else if (normalizedStatus.includes('shipped') || normalizedStatus.includes('delivered')) variant = 'success';
  return <Badge variant={variant}>{status}</Badge>;
}

export function ProfitDisplay({ amount, currency = '£' }: { amount: number; currency?: string }) {
  const isPositive = amount >= 0;
  const colorClass = isPositive ? 'text-[#2EA043]' : 'text-[#F85149]';
  const sign = isPositive ? '+' : '';
  return <span className={`font-bold ${colorClass}`}>{sign}{currency}{Math.abs(amount).toFixed(2)}</span>;
}

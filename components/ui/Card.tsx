import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'gradient' | 'bordered';
  hover?: boolean;
}

export function Card({ children, className = '', variant = 'default', hover = true }: CardProps) {
  const baseClasses = 'rounded-2xl backdrop-blur-xl border';

  const variantClasses = {
    default: 'bg-slate-900/50 border-slate-800/50',
    gradient: 'bg-gradient-to-br from-slate-900/50 to-slate-800/30 border-slate-800/50',
    bordered: 'bg-slate-900/50 border-cyan-500/20',
  };

  const hoverClasses = hover
    ? 'hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/10 transition-all duration-300'
    : '';

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${hoverClasses} ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-6 py-4 border-b border-slate-800/50 ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

interface CardTitleProps {
  children: ReactNode;
  icon?: string;
  className?: string;
}

export function CardTitle({ children, icon, className = '' }: CardTitleProps) {
  return (
    <h3 className={`text-lg font-semibold text-slate-200 flex items-center gap-2 ${className}`}>
      {icon && <span className="text-2xl">{icon}</span>}
      {children}
    </h3>
  );
}

interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function CardDescription({ children, className = '' }: CardDescriptionProps) {
  return <p className={`text-sm text-slate-400 ${className}`}>{children}</p>;
}

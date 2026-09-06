import { ReactNode } from 'react';
import { designTokens } from '../tokens';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, icon, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-start justify-between ${className}`}>
      <div className="flex-1">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="text-2xl text-slate-400">
              {typeof icon === 'string' ? icon : icon}
            </span>
          )}
          <h2 className={designTokens.typography.sectionTitle}>{title}</h2>
        </div>
        {subtitle && (
          <p className={`${designTokens.typography.body} mt-1`}>{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 ml-4">
          {action}
        </div>
      )}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode; // Adding plural for compatibility
  className?: string;
}

export function PageHeader({ title, subtitle, icon, action, actions, className = '' }: PageHeaderProps) {
  const displayAction = action || actions;
  return (
    <div className={`flex items-start justify-between mb-6 ${className}`}>
      <div className="flex-1">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="text-3xl text-slate-400">
              {typeof icon === 'string' ? icon : icon}
            </span>
          )}
          <h1 className={designTokens.typography.pageTitle}>{title}</h1>
        </div>
        {subtitle && (
          <p className={`${designTokens.typography.body} mt-2`}>{subtitle}</p>
        )}
      </div>
      {displayAction && (
        <div className="flex-shrink-0 ml-4">
          {displayAction}
        </div>
      )}
    </div>
  );
}

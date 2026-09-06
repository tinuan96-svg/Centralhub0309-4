import { ReactNode } from 'react';
import { getCardClasses, designTokens } from '../tokens';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'glass';
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  return (
    <div className={`${getCardClasses(variant)} ${className}`}>
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
    <div className={`px-6 py-4 border-b ${designTokens.colors.border.default} ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
  padding?: 'normal' | 'sm';
}

export function CardContent({ children, className = '', padding = 'normal' }: CardContentProps) {
  const paddingClass = padding === 'normal' ? designTokens.spacing.card : designTokens.spacing.cardSm;
  return <div className={`${paddingClass} ${className}`}>{children}</div>;
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

export function CardTitle({ children, className = '' }: CardTitleProps) {
  return (
    <h3 className={`${designTokens.typography.cardTitle} ${className}`}>
      {children}
    </h3>
  );
}

interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function CardDescription({ children, className = '' }: CardDescriptionProps) {
  return (
    <p className={`${designTokens.typography.body} mt-1 ${className}`}>
      {children}
    </p>
  );
}

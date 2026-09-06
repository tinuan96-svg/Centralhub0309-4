import { ReactNode, ButtonHTMLAttributes } from 'react';
import { getButtonClasses } from '../tokens';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  children: ReactNode;
  className?: string;
  size?: string;
}

export function Button({ variant = 'primary', children, className = '', size: _size, ...props }: ButtonProps) {
  return <button className={`${getButtonClasses(variant)} ${className}`} {...props}>{children}</button>;
}

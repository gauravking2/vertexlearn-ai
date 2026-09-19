import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hover?: boolean;
  variant?: 'standard' | 'elevated' | 'featured' | 'inset';
}

export const Card = ({ children, hover = false, variant = 'standard', className = '', ...props }: CardProps) => {
  const variants = {
    standard: 'vl-card bg-[var(--vl-surface)] border-[var(--vl-border)]',
    elevated: 'vl-card-elevated bg-[var(--vl-surface-elevated)] border-[var(--vl-border-strong)]',
    featured: 'vl-card-featured bg-[var(--vl-surface-elevated)] border-[var(--vl-accent-border)]',
    inset: 'vl-panel bg-[var(--vl-surface-inset)] border-[var(--vl-border)]',
  };

  return (
    <div
      className={`border text-[var(--vl-text)] rounded-[var(--vl-radius-lg)] p-5 sm:p-6 ${variants[variant]} ${hover ? 'vl-lift cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

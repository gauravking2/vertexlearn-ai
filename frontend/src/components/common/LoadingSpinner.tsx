import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export const LoadingSpinner = ({ size = 'md', text }: LoadingSpinnerProps) => {
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
  };

  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 py-12" role="status" aria-live="polite">
      <span className="relative inline-grid place-items-center rounded-2xl bg-[var(--vl-accent-soft)] p-3 ring-1 ring-[var(--vl-accent-border)]">
        <Loader2 className="animate-spin text-[var(--vl-accent)]" size={sizeMap[size]} />
      </span>
      {text && <p className="text-sm font-medium text-[var(--vl-text-secondary)]">{text}</p>}
    </div>
  );
};

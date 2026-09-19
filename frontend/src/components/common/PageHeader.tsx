import { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  highlight?: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Shared page header (Phase 18/20 design system): consistent serif title with
 * an italic accent word, muted subtitle, and optional action cluster.
 */
export const PageHeader = ({ title, highlight, subtitle, actions }: PageHeaderProps) => (
  <div className="vl-page-header flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
    <div className="min-w-0">
      <h1 className="text-[clamp(1.875rem,4vw,2.5rem)] font-serif font-normal leading-[1.08] tracking-[-0.025em] text-[var(--vl-text)] mb-2">
        {title} {highlight && <span className="italic text-[#C4612F] dark:text-[#e8a06f]">{highlight}</span>}
      </h1>
      {subtitle && (
        <p className="text-[#5C635D] dark:text-[#b9beb4] leading-relaxed">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

import { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  highlight?: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Shared page header (Phase 18 design system): consistent serif title with
 * an italic accent word, muted subtitle, and optional action cluster.
 */
export const PageHeader = ({ title, highlight, subtitle, actions }: PageHeaderProps) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 animate-fade-up">
    <div>
      <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-1">
        {title} {highlight && <span className="italic text-[#C4612F] dark:text-[#e8a06f]">{highlight}</span>}
      </h1>
      {subtitle && <p className="text-[#5C635D] dark:text-[#b9beb4]">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

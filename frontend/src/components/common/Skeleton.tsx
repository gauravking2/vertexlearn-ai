interface SkeletonProps {
  className?: string;
}

/** Shimmer loading block (reduced-motion safe — shimmer disables itself). */
export const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div aria-hidden="true" className={`vl-skeleton ${className}`} />
);

/** Composite skeleton for card grids (catalog, dashboard, lists). */
export const SkeletonCards = ({ count = 6, className = '' }: { count?: number; className?: string }) => (
  <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 ${className}`} role="status" aria-label="Loading">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="rounded-xl border border-[#E7E1D7] dark:border-[#2c2f2a] bg-[#FFFFFF] dark:bg-[#1a1d17] overflow-hidden">
        <Skeleton className="h-36 w-full" />
        <div className="p-6 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
    ))}
  </div>
);

/** Text-line skeleton for inline loads. */
export const SkeletonLines = ({ lines = 3, className = '' }: { lines?: number; className?: string }) => (
  <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
    ))}
  </div>
);

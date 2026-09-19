import { safePercent, displayPercent } from '@/utils/model';

interface ProgressBarProps {
  progress: number; // 0-100
  height?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const ProgressBar = ({
  progress,
  height = 'md',
  showLabel = false,
}: ProgressBarProps) => {
  const heightStyles = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3.5',
  };

  // Never render NaN/Infinity widths or labels (safePercent clamps 0–100).
  const clampedProgress = safePercent(progress);

  return (
    <div className="w-full">
      <div
        className={`w-full bg-[#FBF9F5] dark:bg-[#23261f] ring-1 ring-inset ring-[#E7E1D7]/80 dark:ring-[#2c2f2a] rounded-full overflow-hidden ${heightStyles[height]}`}
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-gradient-to-r from-[#C4612F] via-[#D3723F] to-[#A94E22] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-1.5 text-right tabular-nums">
          {displayPercent(clampedProgress)}
        </p>
      )}
    </div>
  );
};

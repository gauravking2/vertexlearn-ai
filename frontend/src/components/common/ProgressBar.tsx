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
    md: 'h-2.5',
    lg: 'h-4',
  };

  // Never render NaN/Infinity widths or labels (safePercent clamps 0–100).
  const clampedProgress = safePercent(progress);

  return (
    <div className="w-full">
      <div className={`w-full bg-[#FBF9F5] rounded-full overflow-hidden ${heightStyles[height]}`}>
        <div
          className="h-full bg-gradient-to-r from-[#C4612F] to-[#A94E22] transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-[#5C635D] mt-1.5 text-right">{displayPercent(clampedProgress)}</p>
      )}
    </div>
  );
};

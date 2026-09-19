import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) => {
  return (
    <div className="relative flex flex-col items-center justify-center py-16 px-4 text-center overflow-hidden rounded-xl">
      {/* Ambient halo behind the icon — decorative only */}
      <div
        aria-hidden="true"
        className="absolute top-10 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.10),transparent_65%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.12),transparent_65%)]"
      />
      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center mb-5 shadow-sm">
        <Icon className="text-[#C4612F] dark:text-[#e8a06f]" size={26} />
      </div>
      <h3 className="text-xl font-serif text-[#1F2421] dark:text-[#ece9e2] mb-2">{title}</h3>
      <p className="text-[#5C635D] dark:text-[#b9beb4] mb-6 max-w-md leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
};

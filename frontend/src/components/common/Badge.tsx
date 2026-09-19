interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  className?: string;
}

export const Badge = ({ children, variant = 'neutral', className = '' }: BadgeProps) => {
  const variantStyles = {
    // AA: #8A3E1C on #F2E3D6 ≈ 6.0:1; dark #e8a06f on #2c241c ≈ 7:1.
    primary: 'bg-[#F2E3D6] dark:bg-[#2c241c] text-[#8A3E1C] dark:text-[#e8a06f] ring-1 ring-inset ring-[#C4612F]/15 dark:ring-[#e8a06f]/20',
    success: 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 ring-1 ring-inset ring-green-600/20 dark:ring-green-500/30',
    warning: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 ring-1 ring-inset ring-yellow-600/25 dark:ring-yellow-500/30',
    error: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30',
    neutral: 'bg-[#FBF9F5] dark:bg-[#23261f] text-[#5C635D] dark:text-[#b9beb4] ring-1 ring-inset ring-[#E7E1D7] dark:ring-[#2c2f2a]',
  };

  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-[0.01em] ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

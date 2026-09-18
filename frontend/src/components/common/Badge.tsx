interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  className?: string;
}

export const Badge = ({ children, variant = 'neutral', className = '' }: BadgeProps) => {
  const variantStyles = {
    // AA: #A94E22 on #F2E3D6 ≈ 4.6:1; dark #e8a06f on #2c241c ≈ 7:1.
    primary: 'bg-[#F2E3D6] dark:bg-[#2c241c] text-[#A94E22] dark:text-[#e8a06f]',
    success: 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300',
    warning: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300',
    error: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300',
    neutral: 'bg-[#FBF9F5] dark:bg-[#23261f] text-[#5C635D] dark:text-[#b9beb4]',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

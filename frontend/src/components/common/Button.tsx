import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  as?: any; // Polymorphic component support (e.g., Link)
  to?: string; // For react-router Link
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      className = '',
      children,
      disabled,
      as: Component = 'button',
      to,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium transition-all rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C4612F] focus:ring-2 focus:ring-offset-2 focus:ring-[#C4612F] disabled:opacity-50 disabled:cursor-not-allowed dark:focus-visible:ring-offset-[#12140f] dark:focus:ring-offset-[#12140f]';

    // Contrast (measured, WCAG AA ≥4.5): white on #A94E22 = 5.53;
    // hover #8A3E1C = 7.54. Dark mode: #14110C on #D3723F = 5.60.
    const variantStyles = {
      primary: 'bg-[#A94E22] text-white hover:bg-[#8A3E1C] hover:shadow-md hover:-translate-y-0.5 dark:bg-[#d3723f] dark:hover:bg-[#e07f4b] dark:text-[#14110c]',
      secondary: 'bg-[#1F2421] text-white hover:bg-[#2A2F2B] hover:shadow-md hover:-translate-y-0.5 dark:bg-[#e8e4da] dark:text-[#14110c] dark:hover:bg-[#ffffff]',
      outline: 'border border-[#E7E1D7] text-[#1F2421] hover:bg-[#FBF9F5] hover:border-[#C4612F] dark:border-[#2c2f2a] dark:text-[#ece9e2] dark:hover:bg-[#23261f] dark:hover:border-[#d3723f]',
      ghost: 'text-[#5C635D] hover:bg-[#FBF9F5] hover:text-[#1F2421] dark:text-[#b9beb4] dark:hover:bg-[#23261f] dark:hover:text-[#ece9e2]',
    };

    const sizeStyles = {
      sm: 'text-sm px-4 py-2',
      md: 'text-sm px-6 py-2.5',
      lg: 'text-base px-8 py-3',
    };

    const widthStyle = fullWidth ? 'w-full' : '';

    const componentProps = {
      ref,
      className: `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`,
      disabled: disabled || loading,
      ...(to ? { to } : {}),
      ...props,
    };

    return (
      <Component {...componentProps}>
        {loading && <Loader2 className="animate-spin" size={16} />}
        {children}
      </Component>
    );
  }
);

Button.displayName = 'Button';

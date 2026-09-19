import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'icon';
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
    const baseStyles = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--vl-radius-pill)] font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vl-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vl-canvas)] disabled:pointer-events-none disabled:opacity-45 vl-press';

    const variantStyles = {
      primary:
        'bg-[var(--vl-accent-strong)] text-white shadow-[var(--vl-shadow-control)] hover:bg-[var(--vl-accent-hover)] hover:shadow-[var(--vl-shadow-control-hover)] dark:text-[#1b0d05]',
      secondary:
        'bg-[var(--vl-text)] text-[var(--vl-canvas)] shadow-[var(--vl-shadow-control)] hover:bg-[var(--vl-text-secondary)]',
      outline:
        'border border-[var(--vl-border-strong)] bg-[var(--vl-surface)] text-[var(--vl-text)] shadow-[var(--vl-shadow-control)] hover:border-[var(--vl-accent-border-strong)] hover:bg-[var(--vl-accent-soft)] hover:text-[var(--vl-accent-strong)]',
      ghost:
        'text-[var(--vl-text-secondary)] hover:bg-[var(--vl-surface-hover)] hover:text-[var(--vl-text)]',
      danger:
        'bg-red-700 text-white shadow-[var(--vl-shadow-control)] hover:bg-red-800 dark:bg-red-500 dark:text-[#190505] dark:hover:bg-red-400',
      icon:
        'min-w-11 !px-0 text-[var(--vl-text-secondary)] hover:bg-[var(--vl-surface-hover)] hover:text-[var(--vl-text)]',
    };

    const sizeStyles = {
      sm: 'text-sm px-4 py-2',
      md: 'text-sm px-5 py-2.5',
      lg: 'min-h-12 text-base px-7 py-3',
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

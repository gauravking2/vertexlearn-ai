import { InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? `input-${autoId}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText && !error ? `${inputId}-helper` : undefined;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-[#1F2421] dark:text-[#ece9e2] mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
          className={`vl-input w-full min-h-11 px-4 py-2.5 border ${
            error ? 'border-red-500' : 'border-[var(--vl-border-strong)]'
          } rounded-[var(--vl-radius-md)] bg-[var(--vl-surface-inset)] text-[var(--vl-text)] placeholder:text-[var(--vl-text-muted)] shadow-[var(--vl-shadow-inset)] transition-[border-color,box-shadow,background-color] ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1.5 text-sm text-[#5C635D] dark:text-[#8a9184]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

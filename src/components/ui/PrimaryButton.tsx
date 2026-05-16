import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function PrimaryButton({
  children,
  size = 'md',
  isLoading,
  className,
  disabled,
  ...props
}: PrimaryButtonProps) {
  const paddings = {
    sm: '0 12px',
    md: '0 18px',
    lg: '0 24px',
  };
  const heights = {
    sm: 32,
    md: 40,
    lg: 48,
  };
  const fontSizes = {
    sm: 13,
    md: 14,
    lg: 16,
  };

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg font-semibold',
        'transition-all duration-150 active:scale-[0.98]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      style={{
        background: 'var(--color-primary)',
        color: 'white',
        border: 'none',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        padding: paddings[size],
        height: heights[size],
        fontSize: fontSizes[size],
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isLoading) {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary-hover)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary)';
      }}
      {...props}
    >
      {isLoading ? (
        <span
          style={{
            width: 14,
            height: 14,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
            display: 'inline-block',
          }}
        />
      ) : null}
      {children}
    </button>
  );
}

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function SecondaryButton({
  children,
  size = 'md',
  className,
  disabled,
  ...props
}: SecondaryButtonProps) {
  const paddings = { sm: '0 12px', md: '0 18px', lg: '0 24px' };
  const heights = { sm: 32, md: 40, lg: 48 };
  const fontSizes = { sm: 13, md: 14, lg: 16 };

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg',
        'transition-all duration-150 active:scale-[0.98]',
        'hover:bg-[var(--bg-surface-elevated)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      style={{
        background: 'none',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-default)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: paddings[size],
        height: heights[size],
        fontSize: fontSizes[size],
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function IconButton({ children, label, size = 'md', className, ...props }: IconButtonProps) {
  const sizes = {
    sm: { width: 32, height: 32 },
    md: { width: 44, height: 44 },
    lg: { width: 48, height: 48 },
  };

  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'flex items-center justify-center rounded-lg',
        'transition-all duration-150',
        'hover:bg-[var(--bg-surface-elevated)] active:scale-95',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      style={{
        ...sizes[size],
        border: 'none',
        background: 'none',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
      }}
      {...props}
    >
      {children}
    </button>
  );
}

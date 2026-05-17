import { cn } from '@/lib/utils/cn';

/**
 * v6.1: `quota-exhausted` added to surface the new APIKey status from
 * apiKeyStore (FIX-K1). Visually mapped to an amber-ish "warning" tone
 * leaning toward orange so users can distinguish it from a transient
 * warning at a glance.
 */
type StatusVariant = 'active' | 'warning' | 'dead' | 'quota-exhausted';

interface StatusDotProps {
  variant: StatusVariant;
  size?: number;
  className?: string;
  pulse?: boolean;
}

const VARIANT_COLORS: Record<StatusVariant, string> = {
  active: 'var(--color-api-active)',
  warning: 'var(--color-api-warning)',
  dead: 'var(--color-api-dead)',
  // Falls back to var(--color-warning) — same hue family as 'warning' but
  // styling layers (border / pill bg) can disambiguate by checking the
  // status string directly.
  'quota-exhausted': 'var(--color-warning)',
};

export function StatusDot({ variant, size = 8, className, pulse = false }: StatusDotProps) {
  const color = VARIANT_COLORS[variant];

  return (
    <span
      className={cn('inline-flex items-center justify-center relative flex-shrink-0', className)}
      style={{ width: size, height: size }}
      data-testid={`status-dot-${variant}`}
    >
      {pulse && variant === 'active' && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: color,
            opacity: 0.4,
            animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        />
      )}
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: color,
          display: 'block',
          position: 'relative',
        }}
      />
    </span>
  );
}

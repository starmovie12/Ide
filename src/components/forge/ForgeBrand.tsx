/**
 * ForgeBrand — Part 4 §1.4
 *
 * The "Focus Forge" wordmark in the top bar. Kept as a standalone component
 * so future Part 5 work can swap in a logo without touching ForgeTopBar.
 */

import type { ReactNode } from 'react';

interface ForgeBrandProps {
  children?: ReactNode;
}

export function ForgeBrand({ children = 'Focus Forge' }: ForgeBrandProps) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-display, "Syne", sans-serif)',
        fontWeight: 700,
        fontSize: 15,
        lineHeight: '20px',
        letterSpacing: '-0.01em',
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      aria-label="Focus Forge"
    >
      {children}
    </div>
  );
}

import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          textAlign: 'center',
          padding: '40px 24px',
          maxWidth: 380,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertTriangle size={28} style={{ color: '#ef4444' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 22,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            404 — Page Not Found
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-tertiary)',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 16px',
            height: 36,
            borderRadius: 'var(--radius-base)',
            background: 'var(--color-primary)',
            color: '#fff',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
            transition: 'opacity 150ms',
          }}
        >
          <ArrowLeft size={14} />
          Back to Studio
        </Link>
      </div>
    </div>
  );
}

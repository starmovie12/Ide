import { MessageSquare, FolderOpen, Eye, Settings } from 'lucide-react';
import { Link } from 'wouter';
import { useUIStore } from '@/lib/store/uiStore';

const NAV_ITEMS = [
  { id: 'chat' as const, icon: MessageSquare, label: 'Chat', href: '/' },
  { id: 'files' as const, icon: FolderOpen, label: 'Files', href: '/' },
  { id: 'preview' as const, icon: Eye, label: 'Preview', href: '/' },
  { id: 'settings' as const, icon: Settings, label: 'Settings', href: '/settings' },
];

export function GlassIsland() {
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <nav
      data-testid="glass-island-nav"
      className="flex sm:hidden"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(13, 16, 24, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 28,
        boxShadow: 'var(--shadow-glass-island)',
        width: 280,
        padding: '8px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 50,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <Link key={item.id} href={item.href}>
            <button
              data-testid={`nav-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '8px 14px',
                borderRadius: 20,
                border: 'none',
                background: isActive ? 'var(--bg-glass-island-active)' : 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 200ms var(--ease-glass)',
                minWidth: 56,
              }}
              aria-label={item.label}
            >
              <Icon size={20} />
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-body)',
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: '0.02em',
                }}
              >
                {item.label}
              </span>
            </button>
          </Link>
        );
      })}
    </nav>
  );
}

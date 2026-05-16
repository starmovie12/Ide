import { useUIStore } from '@/lib/store/uiStore';

export function SidebarOverlay() {
  const { sidebarOpen, closeSidebar } = useUIStore();

  if (!sidebarOpen) return null;

  return (
    <div
      data-testid="sidebar-overlay"
      onClick={closeSidebar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        zIndex: 'calc(var(--z-dropdown) - 1)',
        cursor: 'pointer',
      }}
      aria-label="Close sidebar"
    />
  );
}

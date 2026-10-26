import React, { useState, useCallback, useRef, useLayoutEffect } from 'react';
import Sidebar from '@/components/layout/sidebar';
import type { DesktopSidebarMode } from '@/components/layout/sidebar';
import Header from '@/components/layout/header';
import ThemeToggle from '@/components/ui/theme-toggle';
import { Menu } from 'lucide-react';
import { useLocation } from 'wouter';
import { MobileHeaderProvider, useMobileHeaderSlots } from '@/contexts/mobile-header-context';

interface LayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_MODE_KEY = "pfm-sidebar-mode";

const getInitialSidebarMode = (): DesktopSidebarMode => {
  try {
    const stored = localStorage.getItem(SIDEBAR_MODE_KEY);
    if (stored === "expanded" || stored === "collapsed" || stored === "hover") return stored;
  } catch {}
  return "expanded";
};

// Inner layout — consumes MobileHeaderContext (must be inside the provider).
const LayoutInner: React.FC<LayoutProps & {
  sidebarOpen: boolean;
  desktopMode: DesktopSidebarMode;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onSelectDesktopMode: (mode: DesktopSidebarMode) => void;
}> = ({ children, sidebarOpen, desktopMode, onOpenSidebar, onCloseSidebar, onSelectDesktopMode }) => {
  const [location] = useLocation();
  const { content, panel } = useMobileHeaderSlots();

  const isTransactionPage =
    location === '/transactions' ||
    (location.startsWith('/accounts/') && location.endsWith('/transactions'));

  // On mobile the document itself scrolls (instead of <main>), so Safari/Chrome can
  // collapse their toolbars and iOS 26 renders content under the glass bottom bar.
  // Desktop keeps the fixed-height shell with <main> as scroller.

  const mobileHeaderRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Sticky elements below the header (page controls) offset themselves by this height.
  useLayoutEffect(() => {
    const header = mobileHeaderRef.current;
    const root = rootRef.current;
    if (!header || !root) return;
    const update = () => root.style.setProperty('--mobile-header-h', `${header.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className={`flex min-h-[100dvh] md:h-[100dvh] md:overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 transition-colors duration-200`}
      data-sidebar-mode={desktopMode}
    >
      <Sidebar
        isOpen={sidebarOpen}
        onClose={onCloseSidebar}
        desktopMode={desktopMode}
        onSelectDesktopMode={onSelectDesktopMode}
      />

      {/* Mobile backdrop — tapping closes the sidebar. Only covers the strip right of the drawer: a full-width fixed element on the bottom edge makes iOS 26 Safari tint its bottom bar. */}
      {sidebarOpen && (
        <div
          className="fixed inset-y-0 left-64 right-0 z-40 bg-black/40 md:hidden"
          onClick={onCloseSidebar}
        />
      )}

      <div className={`layout-main-container ${isTransactionPage ? '' : 'pb-[env(safe-area-inset-bottom)]'}`}>
        {/* ── Mobile header ── */}
        <header ref={mobileHeaderRef} className={`md:hidden shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-30 sticky top-0 pt-[env(safe-area-inset-top)]`}>
          {/* Row: burger | page content | dark mode */}
          <div className="flex items-center h-16 px-3">
            <button
              onClick={onOpenSidebar}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1 flex items-center px-2 min-w-0">
              {content}
            </div>

            <ThemeToggle />
          </div>

          {/* Expandable panel — renders below the row, inside the header border */}
          {panel && (
            <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
              {panel}
            </div>
          )}
        </header>

        {/* ── Desktop header ── */}
        <div className="hidden md:block">
          <Header onOpenSidebar={onOpenSidebar} />
        </div>

        <main className={`md:overflow-auto flex-1 min-h-0 box-border relative z-0 ${
          isTransactionPage ? 'flex flex-col' : 'p-4 md:p-6'
        }`}>
          <div className={`w-full ${isTransactionPage ? 'flex-1 flex flex-col' : 'max-w-[calc(100vw-2rem)]'}`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopMode, setDesktopMode] = useState<DesktopSidebarMode>(getInitialSidebarMode);

  const selectDesktopMode = useCallback((mode: DesktopSidebarMode) => {
    setDesktopMode(mode);
    try { localStorage.setItem(SIDEBAR_MODE_KEY, mode); } catch {}
  }, []);

  return (
    <MobileHeaderProvider>
      <LayoutInner
        sidebarOpen={sidebarOpen}
        desktopMode={desktopMode}
        onOpenSidebar={() => setSidebarOpen(true)}
        onCloseSidebar={() => setSidebarOpen(false)}
        onSelectDesktopMode={selectDesktopMode}
      >
        {children}
      </LayoutInner>
    </MobileHeaderProvider>
  );
};

export default Layout;

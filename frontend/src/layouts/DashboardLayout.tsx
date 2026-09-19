import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { uiStore } from '@/store/uiStore';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { LanguageSelector } from '@/components/common/LanguageSelector';
import { t } from '@/i18n';
import { localeStore } from '@/store/localeStore';
import {
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  FileText,
  Menu,
  X,
  LogOut,
  BookMarked,
  Bell,
  ShieldCheck,
  Users,
  BarChart3,
  Flag,
  ClipboardList,
  FileQuestion,
  Bot,
  Megaphone,
  CircleDollarSign,
} from 'lucide-react';

export const DashboardLayout = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { sidebarOpen, toggleSidebar } = uiStore();
  const { locale } = localeStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches,
  );
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const isInstructor = user?.roles.includes('instructor');
  const isAdmin = user?.roles.includes('admin');

  const studentLinks = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/courses', icon: BookOpen, label: 'Courses' },
    { to: '/assignments', icon: ClipboardList, label: 'Assignments' },
    { to: '/quizzes', icon: FileQuestion, label: 'Quizzes' },
    { to: '/ai-tutor', icon: Bot, label: 'AI Tutor' },
    { to: '/certificates', icon: GraduationCap, label: 'Certificates' },
    { to: '/notifications', icon: Bell, label: 'Notifications' },
  ];

  const adminLinks = [
    { to: '/admin', icon: ShieldCheck, label: 'Dashboard' },
    { to: '/admin/users', icon: Users, label: 'Users & Roles' },
    { to: '/admin/courses/pending', icon: BookMarked, label: 'Approvals' },
    { to: '/admin/moderation', icon: Flag, label: 'Moderation' },
    { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/admin/revenue', icon: CircleDollarSign, label: 'Revenue' },
    { to: '/courses', icon: BookOpen, label: 'Course Catalog' },
    { to: '/notifications', icon: Bell, label: 'Notifications' },
  ];

  const instructorLinks = [
    { to: '/instructor', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/instructor/courses', icon: BookMarked, label: 'Courses' },
    { to: '/instructor/assignments', icon: ClipboardList, label: 'Assignments' },
    { to: '/instructor/quizzes', icon: FileQuestion, label: 'Quizzes' },
    { to: '/instructor/quiz-drafts', icon: FileText, label: 'AI Quiz Review' },
    { to: '/instructor/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/instructor/announcements', icon: Megaphone, label: 'Announcements' },
    { to: '/courses', icon: BookOpen, label: 'Course Catalog' },
    { to: '/notifications', icon: Bell, label: 'Notifications' },
  ];

  const links = isAdmin ? adminLinks : isInstructor ? instructorLinks : studentLinks;
  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== '/dashboard' && location.pathname.startsWith(`${path}/`)) ||
    (path === '/ai-tutor' && location.pathname.startsWith('/ai-tutor'));
  const avatarInitial = (user?.name ?? '?').charAt(0).toUpperCase();
  const roleLabel = isAdmin ? 'Administrator' : isInstructor ? 'Instructor' : 'Learner';

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      if (event.matches) setMobileNavOpen(false);
    };
    setIsDesktop(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileNavOpen]);

  const handleMenuToggle = () => {
    if (isDesktop) toggleSidebar();
    else setMobileNavOpen((open) => !open);
  };

  const navigation = (mobile = false) => (
    <nav aria-label={mobile ? 'Mobile navigation' : 'Sidebar'} className="space-y-1.5">
      <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--vl-text-muted)]">
        {isAdmin ? 'Governance' : isInstructor ? 'Creator studio' : 'Learning'}
      </p>
      {links.map((link) => {
        const Icon = link.icon;
        const active = isActive(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            aria-current={active ? 'page' : undefined}
            onClick={mobile ? () => setMobileNavOpen(false) : undefined}
            className={`group relative flex min-h-11 items-center gap-3 rounded-[var(--vl-radius-md)] px-3 py-2.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 ${
              active
                ? 'vl-nav-active bg-[var(--vl-accent-soft)] text-[var(--vl-accent-strong)] shadow-[var(--vl-shadow-control)]'
                : 'text-[var(--vl-text-secondary)] hover:bg-[var(--vl-surface-hover)] hover:text-[var(--vl-text)]'
            }`}
          >
            <Icon size={18} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-hover:scale-105" />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--vl-canvas)] text-[var(--vl-text)] vl-canvas">
      <a href="#main-content" className="skip-link">
        {t('a11y.skipToContent', locale)}
      </a>
      <header className="sticky top-0 z-50 border-b border-[var(--vl-border)] bg-[var(--vl-surface)]/90 backdrop-blur-xl">
        <nav aria-label="Primary" className="mx-auto flex h-16 max-w-[1920px] items-center justify-between gap-3 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={handleMenuToggle}
              className="inline-grid min-h-11 min-w-11 place-items-center rounded-[var(--vl-radius-md)] text-[var(--vl-text-secondary)] transition-colors hover:bg-[var(--vl-surface-hover)] hover:text-[var(--vl-text)]"
              aria-label={t('action.toggleSidebar', locale)}
              aria-expanded={isDesktop ? sidebarOpen : mobileNavOpen}
              aria-controls={isDesktop ? 'desktop-sidebar' : 'mobile-navigation'}
            >
              {(isDesktop ? sidebarOpen : mobileNavOpen) ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link to="/dashboard" className="group flex min-w-0 items-center gap-2.5" aria-label="VertexLearn AI home">
              <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#a94e22] via-[#934522] to-[#6851c8] shadow-[var(--vl-shadow-control)] transition-transform duration-150 group-hover:scale-[1.03]" aria-hidden="true">
                <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.34),transparent_55%)]" />
                <GraduationCap className="relative text-white" size={18} />
              </span>
              <span className="truncate font-serif text-lg tracking-[-0.02em] sm:text-xl">
                VertexLearn <span className="italic text-[var(--vl-accent)]">AI</span>
              </span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <LanguageSelector />
              <ThemeToggle />
            </div>
            <div className="hidden items-center gap-2.5 border-s border-[var(--vl-border)] ps-3 sm:flex">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--vl-accent-soft)] text-xs font-bold text-[var(--vl-accent-strong)] ring-1 ring-[var(--vl-accent-border)]" aria-hidden="true">
                {avatarInitial}
              </span>
              <span className="hidden max-w-36 leading-tight lg:block">
                <span className="block truncate text-sm font-semibold text-[var(--vl-text)]">{user?.name}</span>
                <span className="block text-[0.6875rem] text-[var(--vl-text-muted)]">{roleLabel}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-grid min-h-11 min-w-11 place-items-center rounded-[var(--vl-radius-md)] text-[var(--vl-text-secondary)] transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-300"
              aria-label={t('action.logout', locale)}
            >
              <LogOut size={18} />
            </button>
          </div>
        </nav>
      </header>

      <div className="mx-auto flex max-w-[1920px]">
        {sidebarOpen && (
          <aside id="desktop-sidebar" aria-label="Sidebar" className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-e border-[var(--vl-border)] bg-[var(--vl-surface)]/62 p-4 backdrop-blur-sm lg:block">
            {navigation()}
          </aside>
        )}

        {mobileNavOpen && (
          <div id="mobile-navigation" className="fixed inset-0 top-16 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button
              type="button"
              className="absolute inset-0 h-full w-full bg-[#151812]/55 backdrop-blur-sm"
              onClick={() => {
                setMobileNavOpen(false);
                menuButtonRef.current?.focus();
              }}
              aria-label="Close navigation"
            />
            <aside className="vl-mobile-drawer absolute inset-y-0 start-0 w-[min(21rem,88vw)] overflow-y-auto border-e border-[var(--vl-border)] bg-[var(--vl-surface-elevated)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--vl-shadow-elevated)]">
              <div className="mb-4 flex items-center justify-between border-b border-[var(--vl-border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--vl-accent-soft)] text-xs font-bold text-[var(--vl-accent-strong)]" aria-hidden="true">{avatarInitial}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user?.name}</p>
                    <p className="text-xs text-[var(--vl-text-muted)]">{roleLabel}</p>
                  </div>
                </div>
                <button ref={closeButtonRef} type="button" onClick={() => setMobileNavOpen(false)} className="inline-grid min-h-11 min-w-11 place-items-center rounded-[var(--vl-radius-md)] text-[var(--vl-text-secondary)] hover:bg-[var(--vl-surface-hover)]" aria-label="Close navigation menu">
                  <X size={20} />
                </button>
              </div>
              {navigation(true)}
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-[var(--vl-border)] pt-4 md:hidden">
                <LanguageSelector />
                <ThemeToggle />
              </div>
            </aside>
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

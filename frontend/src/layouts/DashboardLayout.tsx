import { Outlet, Link, useLocation } from 'react-router-dom';
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
    // Cross-links so instructors reach the same course-scoped
    // student surfaces (player, AI tutor) without dead ends.
    { to: '/courses', icon: BookOpen, label: 'Course Catalog' },
    { to: '/notifications', icon: Bell, label: 'Notifications' },
  ];

  const links = isAdmin ? adminLinks : isInstructor ? instructorLinks : studentLinks;

  // Course-scoped routes (e.g. /ai-tutor/:courseId) must still highlight the
  // parent nav item, otherwise the sidebar looks broken inside those pages.
  const isActive = (path: string) =>
    location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(`${path}/`)) ||
    (path === '/ai-tutor' && location.pathname.startsWith('/ai-tutor'));

  return (
    <div className="min-h-screen bg-[#F7F4EF] dark:bg-[#12140f] text-[#1F2421] dark:text-[#ece9e2]">
      <a href="#main-content" className="skip-link">
        {t('a11y.skipToContent', locale)}
      </a>
      {/* Top Navigation */}
      <header>
      <nav aria-label="Primary" className="sticky top-0 z-50 bg-[#FFFFFF]/80 dark:bg-[#1a1d17]/90 backdrop-blur-md border-b border-[#E7E1D7] dark:border-[#2c2f2a]">
        <div className="px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-[#F2E3D6] dark:hover:bg-[#23261f] rounded-lg transition-colors"
              aria-label={t('action.toggleSidebar', locale)}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <span
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C3AED] via-[#6D28D9] to-[#06B6D4] flex items-center justify-center shadow-glow"
                aria-hidden="true"
              >
                <GraduationCap className="text-white" size={17} />
              </span>
              <h1 className="text-xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
                Vertexon <span className="italic text-[#A94E22] dark:text-[#e8a06f]">Learning</span>
              </h1>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSelector />
            <ThemeToggle />
            <div className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
              <span className="font-medium text-[#1F2421] dark:text-[#ece9e2]">{user?.name}</span>
              {isInstructor && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-[#F2E3D6] dark:bg-[#2c241c] text-[#A94E22] dark:text-[#e8a06f] rounded-full">
                  Instructor
                </span>
              )}
            </div>
            <button
              onClick={() => logout()}
              className="p-2 hover:bg-[#F2E3D6] dark:hover:bg-[#23261f] rounded-lg transition-colors text-[#5C635D] dark:text-[#b9beb4] hover:text-[#C4612F] dark:hover:text-[#e8a06f]"
              aria-label={t('action.logout', locale)}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside aria-label="Sidebar" className="w-64 min-h-[calc(100vh-4rem)] bg-[#FFFFFF] dark:bg-[#1a1d17] border-r border-[#E7E1D7] dark:border-[#2c2f2a] p-4">
            <nav aria-label="Secondary" className="space-y-1">
              {links.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      active
                        ? 'bg-gradient-to-r from-[#7C3AED]/10 to-[#06B6D4]/10 dark:from-[#7C3AED]/20 dark:to-[#06B6D4]/20 text-[#7C3AED] dark:text-[#A78BFA] font-medium ring-1 ring-[#7C3AED]/20 dark:ring-[#7C3AED]/30'
                        : 'text-[#5C635D] dark:text-[#b9beb4] hover:bg-[#FBF9F5] dark:hover:bg-[#23261f] hover:text-[#1F2421] dark:hover:text-[#ece9e2]'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="text-sm">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Main Content */}
        <main id="main-content" tabIndex={-1} className="flex-1 p-6">
          <div className="max-w-7xl mx-auto animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

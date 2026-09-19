import { Outlet, Navigate } from 'react-router-dom';
import { authStore } from '@/store/authStore';
import { GraduationCap, Sparkles, BookOpen, MessageSquareText } from 'lucide-react';

export const AuthLayout = () => {
  const { isAuthenticated } = authStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen vl-canvas bg-[var(--vl-canvas)] text-[var(--vl-text)] flex items-center justify-center p-4 sm:p-6">
      <a href="#auth-main" className="skip-link">
        Skip to main content
      </a>
      <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_400px] gap-10 items-center">
        {/* Brand panel (decorative, hides on small screens) */}
        <div className="hidden lg:block vl-hero-light rounded-3xl p-10">
          <div className="flex items-center gap-3 mb-8">
            <span
              className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-[#C4612F] via-[#A94E22] to-[#7C3AED] flex items-center justify-center shadow-soft overflow-hidden"
              aria-hidden="true"
            >
              <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.35),transparent_55%)]" />
              <GraduationCap className="relative text-white" size={22} />
            </span>
            <h1 className="text-2xl font-serif font-normal tracking-tight">
              VertexLearn <span className="italic text-[var(--vl-accent)]">AI</span>
            </h1>
          </div>
          <p className="vl-eyebrow text-[#C4612F] dark:text-[#e8a06f] mb-3">AI-powered learning</p>
          <p className="text-3xl font-serif leading-snug tracking-tight mb-4">
            Learn faster with a tutor that knows <span className="italic text-[#C4612F] dark:text-[#e8a06f]">your course</span>.
          </p>
          <ul className="space-y-3.5 text-[#5C635D] dark:text-[#b9beb4]">
            <li className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-[#F2E3D6] dark:bg-[#2c241c] flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-[#C4612F] dark:text-[#e8a06f]" />
              </span>
              <span className="text-sm">Grounded AI answers with citations from your lectures</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-[#F2E3D6] dark:bg-[#2c241c] flex items-center justify-center shrink-0">
                <BookOpen size={16} className="text-[#C4612F] dark:text-[#e8a06f]" />
              </span>
              <span className="text-sm">Structured courses, quizzes, and certificates</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-[#F2E3D6] dark:bg-[#2c241c] flex items-center justify-center shrink-0">
                <MessageSquareText size={16} className="text-[#C4612F] dark:text-[#e8a06f]" />
              </span>
              <span className="text-sm">Discussions, assignments, and instructor feedback</span>
            </li>
          </ul>
        </div>

        {/* Form column */}
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8 text-center lg:hidden">
            <span
              className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#C4612F] via-[#A94E22] to-[#7C3AED] flex items-center justify-center mx-auto mb-3 shadow-soft overflow-hidden"
              aria-hidden="true"
            >
              <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.35),transparent_55%)]" />
              <GraduationCap className="relative text-white" size={20} />
            </span>
            <h1 className="text-2xl font-serif font-normal tracking-tight">
              VertexLearn <span className="italic text-[var(--vl-accent)]">AI</span>
            </h1>
          </div>
          <main id="auth-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

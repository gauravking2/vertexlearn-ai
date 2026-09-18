import { Outlet, Navigate } from 'react-router-dom';
import { authStore } from '@/store/authStore';

export const AuthLayout = () => {
  const { isAuthenticated } = authStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F7F4EF] dark:bg-[#12140f] flex items-center justify-center p-4">
      <a href="#auth-main" className="skip-link">
        Skip to main content
      </a>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
            Vertexon <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Learning</span>
          </h1>
        </div>
        <main id="auth-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

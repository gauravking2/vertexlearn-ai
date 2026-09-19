import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { ShieldAlert, Home } from 'lucide-react';

export const UnauthorizedPage = () => {
  return (
    <div className="min-h-screen vl-canvas bg-[#F7F4EF] dark:bg-[#12140f] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative inline-block">
          <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.12),transparent_70%)]" />
          <ShieldAlert className="relative text-[#C4612F] dark:text-[#e8a06f] mx-auto" size={72} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Access <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Denied</span>
          </h2>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">
            You don't have permission to access this page.
          </p>
        </div>
        <Button as={Link} to="/" size="lg">
          <Home size={20} aria-hidden="true" />
          Back to Home
        </Button>
      </div>
    </div>
  );
};

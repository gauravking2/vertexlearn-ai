import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Home, Compass } from 'lucide-react';

export const NotFoundPage = () => {
  return (
    <div className="min-h-screen vl-canvas bg-[#F7F4EF] dark:bg-[#12140f] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative inline-block">
          <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.12),transparent_70%)]" />
          <Compass className="relative text-[#C4612F] dark:text-[#e8a06f] mx-auto" size={56} aria-hidden="true" />
        </div>
        <h1 className="text-8xl font-serif font-normal tracking-tight text-[#C4612F] dark:text-[#e8a06f] leading-none">
          404
        </h1>
        <div>
          <h2 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Page <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Not Found</span>
          </h2>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">
            The page you're looking for doesn't exist or has been moved.
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

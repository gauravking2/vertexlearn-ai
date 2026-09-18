import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { ShieldAlert, Home } from 'lucide-react';

export const UnauthorizedPage = () => {
  return (
    <div className="min-h-screen bg-[#F7F4EF] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <ShieldAlert size={80} className="text-[#C4612F] mx-auto" />
        <div>
          <h2 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Access <span className="italic text-[#C4612F]">Denied</span>
          </h2>
          <p className="text-[#5C635D]">
            You don't have permission to access this page.
          </p>
        </div>
        <Button as={Link} to="/" size="lg">
          <Home size={20} />
          Back to Home
        </Button>
      </div>
    </div>
  );
};

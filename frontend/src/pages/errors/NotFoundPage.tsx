import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Home } from 'lucide-react';

export const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-[#F7F4EF] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <h1 className="text-9xl font-serif font-normal tracking-tight text-[#C4612F]">
          404
        </h1>
        <div>
          <h2 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Page <span className="italic text-[#C4612F]">Not Found</span>
          </h2>
          <p className="text-[#5C635D]">
            The page you're looking for doesn't exist or has been moved.
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
